import React, { useState, useEffect } from 'react';
import { Save, Globe, Phone, Mail, MapPin, Building, CreditCard, Receipt, Activity, User } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Settings as SettingsType } from '../types';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const Settings = () => {
    const [settings, setSettings] = useState<SettingsType | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const { user } = useAuth();
    const [userName, setUserName] = useState('');

    useEffect(() => {
        if (user) {
            setUserName(user.user_metadata?.name || user.email?.split('@')[0] || 'Admin User');
            if (user.user_metadata?.role !== 'Engineer') {
                fetchSettings();
            } else {
                setIsLoading(false); // Engineers don't need to load company settings
            }
        }
    }, [user]);

    const fetchSettings = async () => {
        try {
            const data = await dataService.getSettings();
            if (data) {
                setSettings(data);
            } else {
                // Initialize default settings if none exist
                setSettings({
                    id: '00000000-0000-0000-0000-000000000000',
                    company_name: '',
                    company_address: '',
                    company_phone: '',
                    company_email: '',
                    contact_name: '',
                    bank_name: '',
                    account_name: '',
                    iban: '',
                    bic: '',
                    vat_reg_number: '',
                    webhook_url: '',
                    updated_at: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
            setMessage({ type: 'error', text: 'Failed to load settings.' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;

        setIsSaving(true);
        setMessage(null);

        try {
            if (user && userName !== (user.user_metadata?.name || user.email?.split('@')[0])) {
                const { error: authError } = await supabase.auth.updateUser({
                    data: { name: userName }
                });
                if (authError) throw authError;
            }

            if (user?.user_metadata?.role !== 'Engineer' && settings) {
                const { error } = await dataService.updateSettings(settings);
                if (error) throw error;
            }

            setMessage({ type: 'success', text: 'Settings saved successfully.' });
        } catch (error: any) {
            console.error('Error saving settings:', error);
            setMessage({ type: 'error', text: `Failed to save settings: ${error.message}` });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Activity className="animate-spin text-delaval-blue" size={32} />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
                    <p className="text-slate-500 mt-1">Manage your company profile and application configurations</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-delaval-blue text-white rounded-xl font-bold hover:bg-delaval-blue/90 transition-all shadow-lg shadow-delaval-blue/20 disabled:opacity-50"
                >
                    {isSaving ? <Activity size={20} className="animate-spin" /> : <Save size={20} />}
                    {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>

            {message && (
                <div className={`p-4 rounded-xl border ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                    {message.text}
                </div>
            )}

            <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* User Profile */}
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 space-y-6 lg:col-span-2">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <User size={20} />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800">User Profile</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">Dashboard Display Name</label>
                            <p className="text-xs text-slate-500 mb-2 ml-1">Shown in the top right corner of the app layout.</p>
                            <div className="relative">
                                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue transition-all bg-slate-50/50"
                                    value={userName}
                                    onChange={e => setUserName(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {user?.user_metadata?.role !== 'Engineer' && (
                    <>
                        {/* Company Details */}
                        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 space-y-6">
                            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                    <Building size={20} />
                                </div>
                                <h2 className="text-xl font-bold text-slate-800">Company Information</h2>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">Company Name</label>
                                    <div className="relative">
                                        <Building size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue transition-all bg-slate-50/50"
                                            value={settings?.company_name || ''}
                                            onChange={e => setSettings(prev => prev ? { ...prev, company_name: e.target.value } : null)}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">Account Manager Name</label>
                                    <p className="text-xs text-slate-500 mb-2 ml-1">Shown as 'Account Manager' on invoices and PDFs.</p>
                                    <div className="relative">
                                        <Building size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="e.g. John Smith"
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue transition-all bg-slate-50/50"
                                            value={settings?.contact_name || ''}
                                            onChange={e => setSettings(prev => prev ? { ...prev, contact_name: e.target.value } : { id: '00000000-0000-0000-0000-000000000000', company_name: '', company_address: '', company_phone: '', company_email: '', contact_name: e.target.value, bank_name: '', account_name: '', iban: '', bic: '', vat_reg_number: '', webhook_url: '', updated_at: new Date().toISOString() })}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">Address</label>
                                    <div className="relative">
                                        <MapPin size={18} className="absolute left-3 top-3 text-slate-400" />
                                        <textarea
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue transition-all bg-slate-50/50 min-h-[100px]"
                                            value={settings?.company_address || ''}
                                            onChange={e => setSettings(prev => prev ? { ...prev, company_address: e.target.value } : null)}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">Phone</label>
                                        <div className="relative">
                                            <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue transition-all bg-slate-50/50"
                                                value={settings?.company_phone || ''}
                                                onChange={e => setSettings(prev => prev ? { ...prev, company_phone: e.target.value } : null)}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">Email</label>
                                        <div className="relative">
                                            <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="email"
                                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue transition-all bg-slate-50/50"
                                                value={settings?.company_email || ''}
                                                onChange={e => setSettings(prev => prev ? { ...prev, company_email: e.target.value } : null)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">VAT Registration Number</label>
                                    <div className="relative">
                                        <Receipt size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue transition-all bg-slate-50/50"
                                            value={settings?.vat_reg_number || ''}
                                            onChange={e => setSettings(prev => prev ? { ...prev, vat_reg_number: e.target.value } : null)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-8">
                            {/* Bank Details */}
                            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 space-y-6">
                                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                                        <CreditCard size={20} />
                                    </div>
                                    <h2 className="text-xl font-bold text-slate-800">Bank Information</h2>
                                </div>

                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">Bank Name</label>
                                            <input
                                                type="text"
                                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue transition-all bg-slate-50/50"
                                                value={settings?.bank_name || ''}
                                                onChange={e => setSettings(prev => prev ? { ...prev, bank_name: e.target.value } : null)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">Account Holder</label>
                                            <input
                                                type="text"
                                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue transition-all bg-slate-50/50"
                                                value={settings?.account_name || ''}
                                                onChange={e => setSettings(prev => prev ? { ...prev, account_name: e.target.value } : null)}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">IBAN</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue transition-all bg-slate-50/50"
                                            value={settings?.iban || ''}
                                            onChange={e => setSettings(prev => prev ? { ...prev, iban: e.target.value } : null)}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">BIC/SWIFT</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue transition-all bg-slate-50/50"
                                            value={settings?.bic || ''}
                                            onChange={e => setSettings(prev => prev ? { ...prev, bic: e.target.value } : null)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Automation/Webhooks */}
                            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 space-y-6">
                                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                                        <Globe size={20} />
                                    </div>
                                    <h2 className="text-xl font-bold text-slate-800">Automation</h2>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">Webhook URL (Reminders)</label>
                                    <p className="text-xs text-slate-500 mb-2 ml-1">Triggered when you send an invoice reminder.</p>
                                    <div className="relative">
                                        <Globe size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="url"
                                            placeholder="https://your-webhook-endpoint.com"
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue transition-all bg-slate-50/50"
                                            value={settings?.webhook_url || ''}
                                            onChange={e => setSettings(prev => prev ? { ...prev, webhook_url: e.target.value } : null)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </form>
        </div>
    );
};

export default Settings;
