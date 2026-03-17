
import React, { useEffect, useState, useRef } from 'react';
import { Search, Plus, Trash2, ArrowLeft, Eye, Wrench, FileText, Briefcase, Euro, Package, Download, Upload, CheckCircle, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Customer } from '../types';
import Modal from '../components/Modal';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';
import { dataService } from '../services/dataService';
import SearchableSelect from '../components/SearchableSelect';
import { useAuth } from '../context/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Settings } from '../types';

const Customers = () => {
    const { user } = useAuth();
    const isAdmin = user?.user_metadata?.role !== 'Engineer';
    const { showToast } = useToast();
    const csvInputRef = useRef<HTMLInputElement>(null);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [activeTab, setActiveTab] = useState('service-history');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newCustomer, setNewCustomer] = useState({
        name: '',
        address: '',
        contact_person: '',
        email: '',
        phone: ''
    });

    const [editingId, setEditingId] = useState<string | null>(null);

    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Bulk delete state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
    const [importing, setImporting] = useState(false);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const handleDeleteClick = () => {
        if (selectedCustomer) {
            setDeleteId(selectedCustomer.id);
            setIsDeleteModalOpen(true);
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        setIsDeleting(true);
        try {
            const { error } = await dataService.deleteCustomer(deleteId);
            if (!error) {
                setCustomers(customers.filter(c => c.id !== deleteId));
                setSelectedCustomer(null);
                setIsDeleteModalOpen(false);
                setDeleteId(null);
                showToast('Deleted', 'Customer deleted successfully', 'success');
            } else {
                showToast('Error', error.toString() || 'Failed to delete customer', 'error');
            }
        } catch (error) {
            console.error('Error deleting customer:', error);
            showToast('Error', 'Failed to delete customer', 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    // Toggle bulk select
    const toggleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        if (selectedIds.size === filteredCustomers.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredCustomers.map(c => c.id)));
        }
    };

    const confirmBulkDelete = async () => {
        setIsDeleting(true);
        try {
            for (const id of selectedIds) {
                await dataService.deleteCustomer(id);
            }
            setCustomers(customers.filter(c => !selectedIds.has(c.id)));
            showToast('Deleted', `${selectedIds.size} customer(s) deleted`, 'success');
            setSelectedIds(new Set());
            setIsBulkDeleteOpen(false);
        } catch (error) {
            console.error('Error bulk deleting:', error);
            showToast('Error', 'Failed to delete some customers', 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    // CSV Import
    const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);

        try {
            const text = await file.text();
            const lines = text.split('\n').filter(l => l.trim());
            if (lines.length < 2) {
                showToast('Error', 'CSV must have a header row and at least one data row', 'error');
                return;
            }

            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('company') || h.includes('farm'));
            const emailIdx = headers.findIndex(h => h.includes('email'));
            const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('tel'));
            const addressIdx = headers.findIndex(h => h.includes('address') || h.includes('location'));
            const contactIdx = headers.findIndex(h => h.includes('contact'));

            if (nameIdx === -1) {
                showToast('Error', 'CSV must have a "Name" column', 'error');
                return;
            }

            const newCustomers = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
                if (!cols[nameIdx]) continue;
                newCustomers.push({
                    name: cols[nameIdx],
                    email: emailIdx >= 0 ? cols[emailIdx] || '' : '',
                    phone: phoneIdx >= 0 ? cols[phoneIdx] || '' : '',
                    address: addressIdx >= 0 ? cols[addressIdx] || '' : '',
                    contact_person: contactIdx >= 0 ? cols[contactIdx] || '' : ''
                });
            }

            if (newCustomers.length === 0) {
                showToast('Error', 'No valid customers found in CSV', 'error');
                return;
            }

            const { error } = await supabase.from('customers').insert(newCustomers);
            if (error) throw error;

            showToast('Imported!', `${newCustomers.length} customer(s) imported from CSV`, 'success');
            fetchCustomers();
        } catch (error) {
            console.error('CSV import error:', error);
            showToast('Error', 'Failed to import CSV', 'error');
        } finally {
            setImporting(false);
            if (csvInputRef.current) csvInputRef.current.value = '';
        }
    };

    useEffect(() => {
        fetchCustomers();
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        const data = await dataService.getSettings();
        setSettings(data);
    };

    const fetchCustomers = async () => {
        try {
            setLoading(true);
            const data = await dataService.getCustomers();
            setCustomers(data);
        } catch (error) {
            console.error('Error fetching customers:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingId) {
                // Update
                const customerPayload = {
                    name: newCustomer.name,
                    email: newCustomer.email || null,
                    phone: newCustomer.phone || null,
                    address_line1: newCustomer.address || null
                };

                const { error } = await supabase
                    .from('customers')
                    .update(customerPayload)
                    .eq('id', editingId);

                if (error) throw error;

                const updatedCustomers = customers.map(c => c.id === editingId ? { ...c, ...newCustomer } : c);
                setCustomers(updatedCustomers);
                // Also update selectedCustomer if it's the one being edited
                if (selectedCustomer && selectedCustomer.id === editingId) {
                    setSelectedCustomer({ ...selectedCustomer, ...newCustomer });
                }
            } else {
                // Create
                const customerPayload = {
                    name: newCustomer.name,
                    email: newCustomer.email || null,
                    phone: newCustomer.phone || null,
                    address_line1: newCustomer.address || null
                };

                const { data, error } = await supabase.from('customers').insert([customerPayload]).select();
                if (error) throw error;
                if (data) {
                    setCustomers([...customers, data[0]]);
                }
            }
            setIsModalOpen(false);
            setEditingId(null);
            setNewCustomer({ name: '', address: '', contact_person: '', email: '', phone: '' });
            showToast('Success', editingId ? 'Customer updated successfully' : 'Customer created successfully', 'success');
        } catch (error: any) {
            console.error('Error saving customer:', error);
            showToast('Error', error.message || 'Failed to save customer.', 'error');
        }
    };

    const handleEditClick = () => {
        if (!selectedCustomer) return;
        setNewCustomer({
            name: selectedCustomer.name,
            address: selectedCustomer.address_line1 || selectedCustomer.address || '',
            contact_person: '',
            email: selectedCustomer.email || '',
            phone: selectedCustomer.phone || ''
        });
        setEditingId(selectedCustomer.id);
        setIsModalOpen(true);
    };

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.address_line1?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const [customerJobs, setCustomerJobs] = useState<any[]>([]);
    const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
    const [customerQuotes, setCustomerQuotes] = useState<any[]>([]);
    const [customerStatements, setCustomerStatements] = useState<any[]>([]);
    const [stats, setStats] = useState({
        totalJobs: 0,
        totalRevenue: 0,
        partsPurchased: 0
    });

    useEffect(() => {
        if (selectedCustomer) {
            fetchCustomerDetails(selectedCustomer.id);
        }
    }, [selectedCustomer]);

    const fetchCustomerDetails = async (customerId: string) => {
        try {
            await dataService.recalculateCustomerBalance(customerId);

            const [jobsRes, invoicesRes, quotesRes, statementsRes] = await Promise.all([
                supabase
                    .from('jobs')
                    .select('*, job_items(total, type, description, quantity, unit_price)')
                    .eq('customer_id', customerId)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('invoices')
                    .select('*')
                    .eq('customer_id', customerId)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('quotes')
                    .select('*')
                    .eq('customer_id', customerId)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('statements')
                    .select('*')
                    .eq('customer_id', customerId)
                    .order('created_at', { ascending: false })
            ]);

            if (jobsRes.error) throw jobsRes.error;

            const jobs = jobsRes.data?.map(job => {
                const total = job.job_items?.reduce((sum: number, item: any) => sum + (item.total || 0), 0) || 0;
                return { ...job, total };
            }) || [];

            setCustomerJobs(jobs);
            setCustomerInvoices(invoicesRes.data || []);
            setCustomerQuotes(quotesRes.data || []);
            setCustomerStatements(statementsRes.data || []);

            // Calculate Stats
            const completedJobs = jobs.filter(j => j.status === 'completed');
            const totalRevenue = completedJobs.reduce((sum, job) => sum + job.total, 0);

            // Calculate parts purchased (from all completed jobs)
            const partsPurchased = completedJobs.reduce((sum, job) => {
                const partsCost = job.job_items
                    ?.filter((item: any) => item.type === 'part')
                    .reduce((itemSum: number, item: any) => itemSum + (item.total || 0), 0) || 0;
                return sum + partsCost;
            }, 0);

            setStats({
                totalJobs: completedJobs.length,
                totalRevenue,
                partsPurchased
            });

        } catch (error) {
            console.error('Error fetching customer details:', error);
        }
    };

    const generateCombinedReport = async () => {
        if (!selectedCustomer) return;
        setIsGenerating(true);
        try {
            const s = settings || {
                company_name: 'MD Burke Ltd',
                company_address: 'Workshop Address',
                company_phone: 'Professional Service',
                company_email: 'service@mdburke.ie',
                company_logo_url: ''
            };

            const doc = new jsPDF();
            const primaryColor: [number, number, number] = [10, 128, 67];
            const secondaryBg: [number, number, number] = [249, 250, 251];
            const borderColor: [number, number, number] = [229, 231, 235];

            // Header Layout (Consistent with Completion Report)
            doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.rect(0, 0, 210, 4, 'F');
            
            const addLogo = async (doc: any) => {
                if (s.company_logo_url) {
                    try {
                        const img = new Image();
                        img.src = s.company_logo_url;
                        await new Promise((resolve, reject) => {
                            img.onload = resolve;
                            img.onerror = reject;
                        });
                        doc.addImage(img, 'PNG', 14, 10, 30, 30);
                        return true;
                    } catch (e) {
                        return false;
                    }
                }
                return false;
            };

            const hasLogo = await addLogo(doc);

            if (!hasLogo) {
                doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                doc.setFontSize(24);
                doc.setFont('helvetica', 'bold');
                doc.text(s.company_name.toUpperCase(), 14, 25);
            }

            doc.setTextColor(100, 100, 100);
            doc.setFontSize(9);
            doc.text(s.company_address || '', hasLogo ? 48 : 14, hasLogo ? 18 : 32);
            doc.text(`Tel: ${s.company_phone || ''} | Email: ${s.company_email || ''}`, hasLogo ? 48 : 14, hasLogo ? 23 : 37);

            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('COMBINED WORK REPORT', 196, 25, { align: 'right' });

            // Customer Info Box
            doc.setFillColor(secondaryBg[0], secondaryBg[1], secondaryBg[2]);
            doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
            doc.roundedRect(14, 52, 182, 30, 2, 2, 'FD');

            doc.setTextColor(0, 0, 0);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('CUSTOMER INFORMATION:', 20, 60);

            doc.setFont('helvetica', 'normal');
            doc.text([
                `Name: ${selectedCustomer.name}`,
                `Address: ${selectedCustomer.address_line1 || selectedCustomer.address || 'No address'}`,
                `Phone: ${selectedCustomer.phone || 'No phone'}`
            ], 20, 66);

            // Stats Summary
            doc.text([
                `Total Jobs: ${stats.totalJobs}`,
                `Last Service: ${customerJobs[0] ? new Date(customerJobs[0].created_at).toLocaleDateString() : 'N/A'}`
            ], 130, 66);

            let currentY = 95;

            // Iterate through jobs
            for (const job of customerJobs) {
                // Check for page break
                if (currentY > 240) {
                    doc.addPage();
                    currentY = 20;
                }

                // Job Divider & Header
                doc.setFillColor(240, 240, 240);
                doc.rect(14, currentY, 182, 10, 'F');
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text(`JOB #${job.job_number || 'N/A'} - ${job.service_type || 'General Service'}`, 18, currentY + 7);
                doc.setFontSize(9);
                doc.text(new Date(job.created_at).toLocaleDateString(), 192, currentY + 7, { align: 'right' });

                currentY += 15;

                // Problem/Diagnosis/Repair
                if (job.repair_summary || job.recommendations) {
                    doc.setFont('helvetica', 'italic');
                    doc.setTextColor(100, 100, 100);
                    const notes = [
                        job.repair_summary ? `Summary: ${job.repair_summary}` : '',
                        job.recommendations ? `Recommendations: ${job.recommendations}` : ''
                    ].filter(Boolean);
                    const splitNotes = doc.splitTextToSize(notes.join(' | '), 175);
                    doc.text(splitNotes, 18, currentY);
                    currentY += (splitNotes.length * 5) + 5;
                }

                // Job Items Table
                if (job.job_items && job.job_items.length > 0) {
                    autoTable(doc, {
                        startY: currentY,
                        head: [['ITEM DESCRIPTION', 'QTY', 'TYPE', 'PRICE', 'TOTAL']],
                        body: job.job_items.map((i: any) => [
                            i.description,
                            i.quantity.toString(),
                            i.type.toUpperCase(),
                            `€${(i.unit_price || 0).toFixed(2)}`,
                            `€${(i.total || 0).toFixed(2)}`
                        ]),
                        theme: 'striped',
                        headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 8 },
                        styles: { fontSize: 8, cellPadding: 2 },
                        margin: { left: 14, right: 14 }
                    });
                    currentY = (doc as any).lastAutoTable.finalY + 15;
                } else {
                    doc.setFont('helvetica', 'normal');
                    doc.text('No parts/labor logged for this job.', 18, currentY);
                    currentY += 15;
                }
            }

            // Footer
            const pageCount = (doc as any).internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(`Generated by MD Burke Workshop System | Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
            }

            doc.save(`CombinedReport_${selectedCustomer.name.replace(/\s+/g, '_')}.pdf`);
            showToast('Success', 'Combined work report generated', 'success');
        } catch (error: any) {
            console.error('PDF Error:', error);
            showToast('Error', 'Failed to generate combined report', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const syncWithPOS = async () => {
        if (!selectedCustomer) return;
        setIsGenerating(true);
        // Simulate POS sync
        await new Promise(r => setTimeout(r, 1500));
        showToast('POS Sync', 'Customer data successfully synced with POS machine', 'success');
        setIsGenerating(false);
    };

    return (
        <div>
            <div className="hidden md:block space-y-6">
                {selectedCustomer ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 overflow-hidden">
                        <button
                            onClick={() => setSelectedCustomer(null)}
                            className="flex items-center gap-2 text-slate-500 hover:text-delaval-blue transition-colors font-medium"
                        >
                            <ArrowLeft size={20} />
                            Back to Customers
                        </button>

                        {/* Customer Header Card */}
                        <div className="section-card p-8">
                            <div className="flex flex-wrap items-start gap-8">
                                <div className="w-20 h-20 bg-[#E6F4EA] text-[#0A8043] rounded-full flex items-center justify-center font-bold text-3xl shadow-inner">
                                    {selectedCustomer.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-[250px]">
                                    <h2 className="text-3xl font-bold font-display text-slate-900 mb-2">{selectedCustomer.name}</h2>
                                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500 mb-4">
                                        {selectedCustomer.address && (
                                            <div className="flex items-center gap-1.5">
                                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                                                {selectedCustomer.address}
                                            </div>
                                        )}
                                        {selectedCustomer.contact_person && (
                                            <div className="flex items-center gap-1.5">
                                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>
                                                {selectedCustomer.contact_person}
                                            </div>
                                        )}
                                        {selectedCustomer.email && (
                                            <div className="flex items-center gap-1.5">
                                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                                                {selectedCustomer.email}
                                            </div>
                                        )}
                                        {selectedCustomer.phone && (
                                            <div className="flex items-center gap-1.5">
                                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                                                {selectedCustomer.phone}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-3">
                                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">Active Account</span>
                                    </div>
                                </div>
                                <div className="text-left md:text-right flex flex-col items-start md:items-end gap-2">
                                    <div className="mb-4">
                                        {/* Status removed */}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={syncWithPOS}
                                            disabled={isGenerating}
                                            className="btn border border-delaval-blue text-delaval-blue hover:bg-delaval-blue/5 transition-colors flex items-center gap-2"
                                        >
                                            <Upload size={16} />
                                            Sync with POS
                                        </button>
                                        <button
                                            onClick={generateCombinedReport}
                                            disabled={isGenerating}
                                            className="btn border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2"
                                        >
                                            <Download size={16} />
                                            {isGenerating ? 'Generating...' : 'Download Combined Report'}
                                        </button>
                                        <button
                                            onClick={handleEditClick}
                                            className="btn border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                                        >
                                            Edit Profile
                                        </button>
                                        <button
                                            onClick={handleDeleteClick}
                                            className="btn border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="stat-card">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="text-3xl font-bold font-display text-slate-900 mb-1">{stats.totalJobs}</div>
                                        <div className="text-sm font-medium text-slate-500">Total Jobs History</div>
                                    </div>
                                    <div className="w-12 h-12 bg-[#E6F9F3] text-[#14A637] rounded-xl flex items-center justify-center">
                                        <Briefcase size={24} />
                                    </div>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="text-3xl font-bold font-display text-slate-900 mb-1">
                                            {customerJobs.filter(j => j.status === 'Completed').length}
                                        </div>
                                        <div className="text-sm font-medium text-slate-500">Jobs Completed</div>
                                    </div>
                                    <div className="w-12 h-12 bg-[#E6F4EA] text-[#0A8043] rounded-xl flex items-center justify-center">
                                        <CheckCircle size={24} />
                                    </div>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="text-3xl font-bold font-display text-slate-900 mb-1">
                                            {customerJobs.filter(j => j.status !== 'Completed' && j.status !== 'Closed').length}
                                        </div>
                                        <div className="text-sm font-medium text-slate-500">Active Jobs</div>
                                    </div>
                                    <div className="w-12 h-12 bg-[#FFF3E6] text-[#FF6B00] rounded-xl flex items-center justify-center">
                                        <Clock size={24} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* History Tabs */}
                        <div className="section-card">
                            <div className="border-b border-slate-200 px-6">
                                <div className="flex gap-8 overflow-x-auto">
                                    {['service-history', 'parts-history', 'service-reports'].map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className={`py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap capitalize
                                            ${activeTab === tab ? 'border-delaval-blue text-delaval-blue' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                        >
                                            {tab.replace('-', ' ')}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="p-6">
                                {activeTab === 'service-history' && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-[#F8FAFB] border-b border-slate-100">
                                                <tr>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Job ID</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Service Type</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Engineer</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Pipeline</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {customerJobs.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} className="px-6 py-8 text-center text-slate-400 italic">
                                                            No service history found for this customer.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    customerJobs.map((job) => (
                                                        <tr key={job.id} className="hover:bg-slate-50/50">
                                                            <td className="px-6 py-4 text-slate-600 font-medium">
                                                                {new Date(job.created_at).toLocaleDateString()}
                                                            </td>
                                                            <td className="px-6 py-4 font-bold text-slate-900">#JOB-{job.job_number || '---'}</td>
                                                            <td className="px-6 py-4 text-slate-600">{job.service_type || job.description || 'General Service'}</td>
                                                            <td className="px-6 py-4 text-slate-600">{job.engineer_name || 'Unassigned'}</td>
                                                            <td className="px-6 py-4">
                                                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                                                ${job.status === 'completed' ? 'bg-green-100 text-green-800' :
                                                                        job.status === 'in_progress' ? 'bg-green-100 text-green-800' :
                                                                            job.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                                                                'bg-slate-100 text-slate-600'}`}>
                                                                    {job.status}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <Link to={`/jobs/${job.id}`} className="inline-block p-1 text-slate-400 hover:text-delaval-blue transition-colors" title="View Job Details">
                                                                    <Eye size={18} />
                                                                </Link>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {activeTab === 'parts-history' && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-[#F8FAFB] border-b border-slate-100">
                                                <tr>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Item</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Job</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Qty</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {customerJobs.flatMap(j =>
                                                    (j.job_items || [])
                                                        .filter((item: any) => item.type === 'part')
                                                        .map((item: any) => (
                                                            <tr key={item.id} className="hover:bg-slate-50/50">
                                                                <td className="px-6 py-4 text-slate-600">{new Date(j.created_at).toLocaleDateString()}</td>
                                                                <td className="px-6 py-4 font-bold text-slate-900">{item.description} {item.inventory?.sku ? `[${item.inventory.sku}]` : ''}</td>
                                                                <td className="px-6 py-4 text-slate-600">#JOB-{j.job_number}</td>
                                                                <td className="px-6 py-4 text-slate-600">{item.quantity}</td>
                                                            </tr>
                                                        )))}
                                                {customerJobs.flatMap(j => (j.job_items || []).filter((i: any) => i.type === 'part')).length === 0 && (
                                                    <tr>
                                                        <td colSpan={4} className="px-6 py-8 text-center text-slate-400 italic">
                                                            No parts history found for this customer.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}



                                {activeTab === 'service-reports' && (
                                    <div className="p-12 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl m-2">
                                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mx-auto mb-4">
                                            <FileText size={32} className="text-slate-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-800">Service Reports</h3>
                                        <p className="text-slate-500 mt-1 max-w-sm mx-auto">Upload and manage service reports for this customer.</p>
                                        <button className="mt-6 px-6 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2 mx-auto disabled:opacity-50" title="Coming Soon">
                                            <Upload size={18} />
                                            Upload Report (Coming Soon)
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h1 className="text-2xl font-bold font-display text-slate-900">Customer Accounts</h1>
                                <p className="text-slate-500">Manage customer accounts and contact details</p>
                            </div>
                            {isAdmin && (
                                <div className="flex gap-2">
                                    {selectedIds.size > 0 && (
                                        <button
                                            onClick={() => setIsBulkDeleteOpen(true)}
                                            className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-red-900/20 active:scale-95"
                                        >
                                            <Trash2 size={18} />
                                            Delete ({selectedIds.size})
                                        </button>
                                    )}
                                    <input
                                        ref={csvInputRef}
                                        type="file"
                                        accept=".csv"
                                        className="hidden"
                                        onChange={handleCSVImport}
                                    />
                                    <button
                                        onClick={() => csvInputRef.current?.click()}
                                        disabled={importing}
                                        className="flex items-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2.5 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        <Upload size={18} />
                                        {importing ? 'Importing...' : 'CSV Import'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditingId(null);
                                            setNewCustomer({ name: '', address: '', contact_person: '', email: '', phone: '' });
                                            setIsModalOpen(true);
                                        }}
                                        className="flex items-center gap-2 bg-delaval-blue hover:bg-delaval-dark-blue text-white px-4 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-green-900/20 active:scale-95"
                                    >
                                        <Plus size={20} />
                                        Add Customer
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="section-card p-6">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                    <input
                                        type="text"
                                        placeholder="Search customers by name, location, or account number..."
                                        className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue transition-all"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <button
                                    onClick={selectAll}
                                    className="text-xs font-bold text-slate-500 hover:text-delaval-blue whitespace-nowrap transition-colors"
                                >
                                    {selectedIds.size === filteredCustomers.length ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                                {loading ? (
                                    <div className="col-span-full text-center py-12 text-slate-500">Loading customers...</div>
                                ) : filteredCustomers.map((customer) => (
                                    <div
                                        key={customer.id}
                                        onClick={() => setSelectedCustomer(customer)}
                                        className={`stat-card group cursor-pointer border-2 p-6 transition-all relative ${selectedIds.has(customer.id) ? 'border-red-300 bg-red-50/30' : 'border-transparent hover:border-delaval-blue'}`}
                                    >
                                        {/* Checkbox */}
                                        {isAdmin && (
                                            <div
                                                onClick={(e) => toggleSelect(customer.id, e)}
                                                className={`absolute top-3 right-3 w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-all ${selectedIds.has(customer.id) ? 'bg-red-500 border-red-500 text-white' : 'border-slate-300 hover:border-delaval-blue'}`}
                                            >
                                                {selectedIds.has(customer.id) && (
                                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6L5 8L9 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                )}
                                            </div>
                                        )}
                                        <div className="w-16 h-16 bg-[#E6F4EA] text-[#0A8043] rounded-full flex items-center justify-center font-bold text-2xl mb-4 group-hover:scale-110 transition-transform">
                                            {customer.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 mb-2">{customer.name}</h3>

                                        {/* Contact Details */}
                                        <div className="space-y-1.5 text-sm">
                                            {customer.address && (
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                                                    <span className="truncate">{customer.address}</span>
                                                </div>
                                            )}
                                            {customer.email && (
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                                                    <span className="truncate">{customer.email}</span>
                                                </div>
                                            )}
                                            {customer.phone && (
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                                                    <span>{customer.phone}</span>
                                                </div>
                                            )}
                                            {!customer.address && !customer.email && !customer.phone && (
                                                <div className="text-slate-400 italic text-xs">No contact info</div>
                                            )}
                                        </div>

                                        <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-100">
                                            <div>
                                                <div className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Total Jobs</div>
                                                <div className={`text-xl font-extrabold text-delaval-blue`}>
                                                    {customerJobs.filter(j => j.customer_id === customer.id).length}
                                                </div>
                                            </div>
                                            <button className="w-10 h-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-delaval-blue group-hover:text-white transition-colors">
                                                <ArrowLeft size={20} className="rotate-180" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* MOBILE VIEW */}
            <div className="block md:hidden pb-24 bg-[#F8FAFB] min-h-screen text-[#1a1a1a]">
                {selectedCustomer ? (
                    <div className="px-4 pb-6 pt-2">
                        {/* Header Navigation */}
                        <div className="flex items-center justify-between mb-8">
                            <button
                                onClick={() => setSelectedCustomer(null)}
                                className="flex items-center justify-center p-2 -ml-2 text-slate-600 bg-white border border-slate-200 rounded-full shadow-sm hover:bg-slate-50 transition-colors"
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <div className="flex items-center gap-2">
                                <button onClick={handleEditClick} className="text-sm font-bold text-slate-700 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm active:scale-95 transition-transform">
                                    Edit
                                </button>
                                <button 
                                    onClick={handleDeleteClick} 
                                    className="p-2 text-red-600 bg-white border border-red-100 rounded-full shadow-sm active:scale-95 transition-transform"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Customer Profile Header */}
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-[88px] h-[88px] bg-gradient-to-br from-[#E6F4EA] to-[#C1E7CD] text-[#0A8043] rounded-[2rem] flex items-center justify-center font-bold text-[32px] mb-4 shadow-[0_4px_20px_rgba(0,81,165,0.15)] ring-4 ring-white">
                                {selectedCustomer.name.substring(0, 2).toUpperCase()}
                            </div>
                            <h2 className="text-[22px] font-bold text-slate-900 mb-1.5 leading-tight tracking-tight">{selectedCustomer.name}</h2>
                            <p className="text-[#64748B] text-sm mb-3 px-4 leading-relaxed">{selectedCustomer.address || 'No address provided'}</p>
                            <a href={`tel:${selectedCustomer.phone}`} className="inline-flex items-center justify-center px-4 py-2 bg-slate-100 text-[#0A8043] rounded-full text-sm font-bold tracking-wide">
                                📞&nbsp;&nbsp;{selectedCustomer.phone || 'Add Phone'}
                            </a>
                        </div>

                        {/* Balance Banner */}
                         {/* Status removed */}

                        {/* Quick Actions Grid */}
                        <div className="grid grid-cols-2 gap-3 mb-8">
                            <Link to="/jobs" state={{ customerMode: true, prefillCustomer: selectedCustomer }} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform">
                                <div className="w-10 h-10 rounded-full bg-[#E6F4EA] text-[#0A8043] flex items-center justify-center">
                                    <Plus size={20} />
                                </div>
                                <span className="text-[11px] font-bold text-slate-700 tracking-wide uppercase">New Job</span>
                            </Link>
                            <button
                                onClick={generateCombinedReport}
                                disabled={isGenerating}
                                className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform w-full disabled:opacity-50"
                            >
                                <div className="w-10 h-10 rounded-full bg-[#E6F9F3] text-[#14A637] flex items-center justify-center">
                                    {isGenerating ? (
                                        <div className="w-5 h-5 border-2 border-[#14A637] border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <FileText size={20} />
                                    )}
                                </div>
                                <span className="text-[11px] font-bold text-slate-700 tracking-wide uppercase">
                                    {isGenerating ? 'Generating...' : 'Report'}
                                </span>
                            </button>
                        </div>

                        {/* Equipment Section */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-3 px-1">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Equipment</h3>
                            </div>
                            <div className="bg-white rounded-[1.25rem] shadow-sm border border-slate-100 overflow-hidden">
                                <div className="p-4 border-b border-slate-50 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-[#E6F4EA] rounded-xl flex items-center justify-center text-[#0A8043]">
                                        <Wrench size={18} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-900 text-sm">STIHL iMOW 7.0</div>
                                        <div className="text-[11px] text-slate-500 font-medium">Heavy Machinery System</div>
                                    </div>
                                </div>
                                <div className="p-4 bg-slate-50/50">
                                    <div className="flex justify-between items-center py-2 border-b border-slate-100/50">
                                        <span className="text-xs text-slate-500 font-medium tracking-wide">Serial Number</span>
                                        <span className="text-xs font-bold text-slate-900">EQ-2023-889</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-slate-100/50">
                                        <span className="text-xs text-slate-500 font-medium tracking-wide">Installed</span>
                                        <span className="text-xs font-bold text-slate-900">Oct 2023</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-2">
                                        <span className="text-xs text-slate-500 font-medium tracking-wide">Last Service</span>
                                        <span className="text-xs font-bold text-[#14A637]">2 weeks ago</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Job History Section */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-3 px-1">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Job History</h3>
                                <Link to="/jobs" className="text-[11px] font-bold text-[#0A8043] uppercase tracking-wider">See All</Link>
                            </div>
                            <div className="bg-white rounded-[1.25rem] shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-50">
                                {customerJobs.length === 0 ? (
                                    <div className="p-6 text-center text-slate-400 italic text-sm">No job history.</div>
                                ) : (
                                    customerJobs.slice(0, 3).map(job => (
                                        <Link key={job.id} to={`/jobs/${job.id}`} className="flex items-center p-4 active:bg-slate-50 transition-colors">
                                            <div className="flex-1 pr-4">
                                                <div className="flex justify-between items-start mb-1">
                                                    <div className="font-bold text-slate-900 text-sm tracking-tight">{job.service_type || 'Maintenance'}</div>
                                                    {/* <div className="font-bold text-slate-900 text-sm">€{job.total.toLocaleString()}</div> */}
                                                </div>
                                                <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                                                    <span>{new Date(job.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                    <span className={`uppercase tracking-wider ${job.status === 'completed' ? 'text-[#14A637]' : 'text-[#0A8043]'}`}>
                                                        {job.status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                            </div>
                                            <ArrowLeft size={16} className="text-slate-300 rotate-180 shrink-0" />
                                        </Link>
                                    ))
                                )}
                            </div>
                        </div>


                    </div>
                ) : (
                    <>
                        {/* Green Hero Header */}
                        <div className="bg-[#0A8043] text-white pt-6 pb-16 px-5 relative w-full">
                            <p className="text-white/60 text-[10px] font-bold mb-1 uppercase tracking-widest">Client Direct</p>
                            <div className="flex justify-between items-start">
                                <h1 className="text-2xl font-black tracking-tight">Customers</h1>
                                <button
                                    onClick={() => {
                                        setEditingId(null);
                                        setNewCustomer({ name: '', address: '', contact_person: '', email: '', phone: '' });
                                        setIsModalOpen(true);
                                    }}
                                    className="w-10 h-10 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/30 shadow-lg active:scale-95 transition-all"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Overlapping Search Bar */}
                        <div className="px-5 -mt-8 relative z-20 mb-4">
                            <div className="bg-white rounded-2xl flex items-center px-4 py-3.5 border border-slate-200/60 focus-within:border-slate-300 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
                                <Search size={18} className="text-slate-400 mr-3 shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Search customers..."
                                    className="w-full bg-transparent border-none outline-none text-[15px] font-medium text-slate-900 placeholder-slate-400"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="pt-4 px-5 pb-8 space-y-4">
                            {loading ? (
                                <div className="text-center py-10 text-slate-400 font-medium text-sm">Loading customers...</div>
                            ) : filteredCustomers.map((customer) => {
                                return (
                                    <div key={customer.id} onClick={() => setSelectedCustomer(customer)} className="bg-white border border-slate-100 rounded-[1.25rem] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.02)] active:scale-[0.99] transition-transform cursor-pointer">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 shrink-0 bg-[#E6F4EA] text-[#0A8043] rounded-full flex items-center justify-center font-bold text-sm">
                                                    {customer.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-slate-900 text-[15px] leading-tight mb-0.5">{customer.name}</h3>
                                                    <p className="text-[#64748B] text-[12px] truncate max-w-[180px]">{customer.address || 'No address'}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Balance</div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-50">
                                            <span className="inline-flex items-center px-2 py-1 rounded bg-[#E6F4EA] text-[#0A8043] text-[10px] font-bold tracking-wide">
                                                Pro Series 3000 {/* Mock Equipment */}
                                            </span>
                                            <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-600 text-[10px] font-bold tracking-wide">
                                                3 jobs {/* Mock Data */}
                                            </span>
                                            {customer.phone && (
                                                <span className="ml-auto text-[#0A8043] text-[11px] font-bold flex items-center gap-1">
                                                    📞 {customer.phone}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {filteredCustomers.length === 0 && !loading && (
                                <div className="text-center py-10 text-slate-400 italic">No customers found.</div>
                            )}
                        </div>
                    </>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Edit Customer" : "Add New Customer"}>
                <form onSubmit={handleSaveCustomer} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Company / Customer Name</label>
                            <input required type="text" className="w-full px-4 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-delaval-blue/20" value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                            <textarea className="w-full px-4 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-delaval-blue/20" rows={3} value={newCustomer.address} onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })} />
                        </div>
                        <div className="col-span-1 md:col-span-1">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
                            <input type="text" className="w-full px-4 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-delaval-blue/20" value={newCustomer.contact_person} onChange={e => setNewCustomer({ ...newCustomer, contact_person: e.target.value })} />
                        </div>
                        <div className="col-span-1 md:col-span-1">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                            <input type="tel" className="w-full px-4 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-delaval-blue/20" value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                            <input type="email" className="w-full px-4 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-delaval-blue/20" value={newCustomer.email} onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })} />
                        </div>
                    </div>
                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-delaval-blue text-white rounded-lg font-bold hover:bg-delaval-dark-blue">Save Customer</button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Customer"
                message="Are you sure you want to delete this customer? This action cannot be undone."
                isDestructive={true}
                isLoading={isDeleting}
                confirmText="Delete Customer"
            />

            <ConfirmModal
                isOpen={isBulkDeleteOpen}
                onClose={() => setIsBulkDeleteOpen(false)}
                onConfirm={confirmBulkDelete}
                title="Delete Selected Customers"
                message={`Are you sure you want to delete ${selectedIds.size} selected customer(s)? This action cannot be undone.`}
                isDestructive={true}
                isLoading={isDeleting}
                confirmText={`Delete ${selectedIds.size} Customer(s)`}
            />
        </div >
    );

};

export default Customers;
