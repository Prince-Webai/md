import { supabase } from '../lib/supabase';
import { Job, Invoice, Customer, InventoryItem, Settings } from '../types';

// Helper to check if Supabase is configured
const isSupabaseConfigured = () => {
    return import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;
};

export const dataService = {
    async getJobs(status?: string, engineerName?: string): Promise<Job[]> {
        if (!isSupabaseConfigured()) return [];

        try {
            let query = supabase
                .from('jobs')
                .select('*, customers(*)')
                .order('created_at', { ascending: false });

            if (status && status !== 'all') {
                query = query.eq('status', status);
            }

            if (engineerName) {
                // If it's a UUID (ID), use eq('mechanic_id', ...)
                // If it's a string name, we might need a different approach, but DB usually uses IDs.
                query = query.eq('mechanic_id', engineerName);
            }

            const { data, error } = await query;
            if (error) throw error;
            // Map DB column names to UI field names
            return (data || []).map((job: any) => ({
                ...job,
                service_type: job.machine_details || job.service_type || '',
                engineer_name: job.mechanic_id || job.engineer_name || '',
                notes: job.problem_description || job.notes || ''
            }));
        } catch (error) {
            console.error('Error fetching jobs:', error);
            return [];
        }
    },

    async getJobById(id: string): Promise<Job | null> {
        if (!isSupabaseConfigured()) return null;
        try {
            const { data, error } = await supabase
                .from('jobs')
                .select('*, customers(*)')
                .eq('id', id)
                .single();
            if (error) throw error;
            if (!data) return null;
            return {
                ...data,
                service_type: data.machine_details || data.service_type || '',
                engineer_name: data.mechanic_id || data.engineer_name || '',
                notes: data.problem_description || data.notes || ''
            };
        } catch (error) {
            console.error('Error fetching job by ID:', error);
            return null;
        }
    },

    async getCustomers(): Promise<Customer[]> {
        if (!isSupabaseConfigured()) return [];

        try {
            const { data, error } = await supabase
                .from('customers')
                .select('*')
                .order('name');
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching customers:', error);
            return [];
        }
    },

    async getInvoices(): Promise<Invoice[]> {
        if (!isSupabaseConfigured()) return [];

        try {
            const { data, error } = await supabase
                .from('invoices')
                .select('*, customers(*)')
                .order('date_issued', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching invoices:', error);
            return [];
        }
    },

    async getJobItems(jobId: string): Promise<any[]> {
        if (!isSupabaseConfigured()) return [];
        try {
            const { data, error } = await supabase
                .from('job_items')
                .select('*')
                .eq('job_id', jobId);
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching job items:', error);
            return [];
        }
    },

    async addJobItem(item: any): Promise<{ data: any, error: any }> {
        if (!isSupabaseConfigured()) return { data: null, error: 'Supabase not configured' };
        return await supabase.from('job_items').insert([item]).select().single();
    },

    async addJobItems(items: any[]): Promise<{ data: any, error: any }> {
        if (!isSupabaseConfigured()) return { data: null, error: 'Supabase not configured' };
        return await supabase.from('job_items').insert(items).select();
    },

    async getEngineers(): Promise<any[]> {
        if (!isSupabaseConfigured()) return [];

        try {
            const { data, error } = await supabase.from('engineers').select('*').order('name');
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching engineers', error);
            return [];
        }
    },

    async getInventory(): Promise<InventoryItem[]> {
        if (!isSupabaseConfigured()) return [];

        try {
            const { data, error } = await supabase.from('inventory').select('*');
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error("Error fetching inventory", error);
            return [];
        }
    },

    async createJob(job: Partial<Job>): Promise<{ data: Job | null, error: any }> {
        if (!isSupabaseConfigured()) {
            return { data: null, error: 'Supabase not configured' };
        }

        return await supabase.from('jobs').insert([job]).select().single();
    },

    async updateJob(id: string, updates: Partial<Job>): Promise<{ error: any }> {
        if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };

        let shouldRecalculate = false;
        let customerIdToRecalculate: string | null = null;

        // Determine if status is changing to or from 'completed'
        if (updates.status) {
            const { data: currentJob } = await supabase
                .from('jobs')
                .select('status, customer_id')
                .eq('id', id)
                .single();

            if (currentJob && currentJob.status !== updates.status &&
                (currentJob.status === 'Completed' || updates.status === 'Completed')) {
                shouldRecalculate = true;
                customerIdToRecalculate = currentJob.customer_id;
            }
        }

        const result = await supabase.from('jobs').update(updates).eq('id', id);

        // Trigger secure synchronized recalculation
        if (shouldRecalculate && customerIdToRecalculate && !result.error) {
            // Using logic added earlier
            await this.recalculateCustomerBalance(customerIdToRecalculate);
        }

        return result;
    },

    async deleteJob(id: string): Promise<{ error: any }> {
        if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };

        try {
            // 1. Delete job items
            const { error: itemsError } = await supabase.from('job_items').delete().eq('job_id', id);
            if (itemsError) return { error: itemsError };

            // 2. Safely delete associated invoices and their items
            const { data: invoices } = await supabase.from('invoices').select('id').eq('job_id', id);
            if (invoices && invoices.length > 0) {
                const invoiceIds = invoices.map(i => i.id);
                // Invoices might have payments in the future, but right now we just delete invoice_items
                await supabase.from('invoice_items').delete().in('invoice_id', invoiceIds);
                await supabase.from('invoices').delete().in('id', invoiceIds);
            }

            // 3. Safely delete associated quotes and their items
            const { data: quotes } = await supabase.from('quotes').select('id').eq('job_id', id);
            if (quotes && quotes.length > 0) {
                const quoteIds = quotes.map(q => q.id);
                await supabase.from('quote_items').delete().in('quote_id', quoteIds);
                await supabase.from('quotes').delete().in('id', quoteIds);
            }

            // 4. Delete statements linked to this job
            await supabase.from('statements').delete().eq('job_id', id);

            // 5. Finally, delete the job
            return await supabase.from('jobs').delete().eq('id', id);
        } catch (error) {
            console.error("Failed to delete job safely", error);
            return { error };
        }
    },

    async deleteCustomer(id: string): Promise<{ error: any }> {
        if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };
        return await supabase.from('customers').delete().eq('id', id);
    },

    async updateInvoice(id: string, updates: Partial<Invoice>): Promise<{ error: any }> {
        if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };
        return await supabase.from('invoices').update(updates).eq('id', id);
    },

    async deleteInvoice(id: string): Promise<{ error: any }> {
        if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };

        // Delete related invoice items first
        await supabase.from('invoice_items').delete().eq('invoice_id', id);

        return await supabase.from('invoices').delete().eq('id', id);
    },

    async getInvoiceItems(invoiceId: string): Promise<any[]> {
        if (!isSupabaseConfigured()) return [];
        try {
            const { data, error } = await supabase
                .from('invoice_items')
                .select('*')
                .eq('invoice_id', invoiceId);
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching invoice items:', error);
            return [];
        }
    },

    async addInvoiceItems(items: any[]): Promise<{ data: any, error: any }> {
        if (!isSupabaseConfigured()) return { data: null, error: 'Supabase not configured' };
        return await supabase.from('invoice_items').insert(items).select();
    },

    async deleteStatement(id: string): Promise<{ error: any }> {
        if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };
        return await supabase.from('statements').delete().eq('id', id);
    },

    async getSettings(): Promise<Settings | null> {
        if (!isSupabaseConfigured()) return null;
        try {
            const { data, error } = await supabase
                .from('settings')
                .select('*')
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching settings:', error);
            return null;
        }
    },

    async updateSettings(updates: Partial<Settings>): Promise<{ error: any }> {
        if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };
        return await supabase
            .from('settings')
            .upsert({
                ...updates,
                id: '00000000-0000-0000-0000-000000000000',
                updated_at: new Date().toISOString()
            });
    },

    async recalculateCustomerBalance(customerId: string): Promise<number> {
        if (!isSupabaseConfigured()) return 0;
        try {
            // 1. Sum of all completed jobs
            const { data: completedJobs } = await supabase.from('jobs').select('id').eq('customer_id', customerId).eq('status', 'completed');
            let totalJobValue = 0;
            if (completedJobs && completedJobs.length > 0) {
                const jobIds = completedJobs.map(j => j.id);
                // Chunk queries if too many jobs, but simple array is fine for normal loads
                const { data: jobItems } = await supabase.from('job_items').select('total').in('job_id', jobIds);
                totalJobValue = (jobItems || []).reduce((sum, item) => sum + (item.total || 0), 0);
            }

            // 2. Sum of all standalone invoices (where job_id is null)
            const { data: standaloneInvoices } = await supabase.from('invoices').select('total_amount').eq('customer_id', customerId).is('job_id', null);
            const totalStandaloneInvoices = (standaloneInvoices || []).reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

            // 3. Sum of all payments (across all invoices)
            const { data: allInvoices } = await supabase.from('invoices').select('amount_paid').eq('customer_id', customerId);
            const totalPaid = (allInvoices || []).reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);

            // 4. Calculate proper balance
            const newBalance = totalJobValue + totalStandaloneInvoices - totalPaid;

            await supabase.from('customers').update({ account_balance: newBalance }).eq('id', customerId);
            return newBalance;
        } catch (error) {
            console.error('Error recalculating bounds:', error);
            return 0;
        }
    },

    async getAnalyticsData(days: number = 7): Promise<any> {
        if (!isSupabaseConfigured()) return { jobs: [], items: [] };

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString();

        try {
            const [jobsRes, itemsRes] = await Promise.all([
                supabase.from('jobs').select('*').gte('created_at', startDateStr),
                supabase.from('job_items').select('*, inventory(name, sku)').gte('created_at', startDateStr)
            ]);

            return {
                jobs: jobsRes.data || [],
                items: itemsRes.data || []
            };
        } catch (error) {
            console.error('Error fetching analytics data:', error);
            return { jobs: [], items: [] };
        }
    },

    async getTopUsedParts(limit: number = 5): Promise<any[]> {
        if (!isSupabaseConfigured()) return [];
        try {
            const { data, error } = await supabase
                .from('job_items')
                .select('inventory_id, quantity, inventory(name, sku)')
                .not('inventory_id', 'is', null)
                .eq('type', 'part');

            if (error) throw error;

            // Grouping and summing in JS since Supabase simple client doesn't support complex group by easily
            const partsMap = new Map();
            (data || []).forEach(item => {
                const id = item.inventory_id;
                const inventory = item.inventory as any;
                const existing = partsMap.get(id) || { name: inventory?.name || 'Unknown', sku: inventory?.sku || '', count: 0 };
                partsMap.set(id, { ...existing, count: existing.count + (item.quantity || 1) });
            });

            return Array.from(partsMap.values())
                .sort((a, b) => b.count - a.count)
                .slice(0, limit);
        } catch (error) {
            console.error('Error fetching top parts:', error);
            return [];
        }
    }

};
