import React, { useEffect, useState } from 'react';
import { Search, Calendar, User, FileText, Trash2, Pencil, Wrench, Activity, Plus, ArrowRight, Package } from 'lucide-react';
import { Job, Customer } from '../types';
import { Link, useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import DatePicker from '../components/DatePicker';
import SearchableSelect from '../components/SearchableSelect';
import { dataService } from '../services/dataService';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const Jobs = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.user_metadata?.role !== 'Engineer';
    const [jobs, setJobs] = useState<Job[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newJob, setNewJob] = useState<Partial<Job>>({
        customer_id: '',
        engineer_name: '',
        service_type: '',
        status: 'Booked In',
        date_scheduled: new Date().toISOString().split('T')[0],
        notes: ''
    });

    const [modalItems, setModalItems] = useState<any[]>([]);
    const [inventory, setInventory] = useState<any[]>([]);
    const [newItem, setNewItem] = useState({ description: '', quantity: 1, unit_price: 0, type: 'part' as const });
    const [isAddingCustom, setIsAddingCustom] = useState(false);

    // Inline Customer Creation State
    const [isAddingNewCustomer, setIsAddingNewCustomer] = useState(false);
    const [newCustomerData, setNewCustomerData] = useState({ name: '', phone: '', email: '', address: '' });

    const [engineers, setEngineers] = useState<any[]>([]);

    useEffect(() => {
        loadData();
    }, [activeTab]); // Reload when tab changes (server-side filter)

    const loadData = async () => {
        setLoading(true);
        await Promise.all([fetchJobs(), fetchCustomers(), fetchEngineers(), fetchInventory()]);
        setLoading(false);
    };

    const fetchInventory = async () => {
        const data = await dataService.getInventory();
        setInventory(data);
    };

    const fetchJobs = async () => {
        const userRole = user?.user_metadata?.role;
        const engineerToFetch = userRole === 'Engineer' ? (user?.user_metadata?.name || user?.email?.split('@')[0]) : undefined;
        // Fetch ALL jobs for this context (admin/engineer) to keep tab counts accurate
        const data = await dataService.getJobs(undefined, engineerToFetch);
        setJobs(data);
    };

    const fetchCustomers = async () => {
        const data = await dataService.getCustomers();
        setCustomers(data);
    };

    const fetchEngineers = async () => {
        const data = await dataService.getEngineers();
        setEngineers(data);
    };

    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleEditClick = async (job: Job) => {
        setNewJob({
            customer_id: job.customer_id,
            engineer_name: job.engineer_name || '',
            service_type: job.service_type,
            status: job.status,
            date_scheduled: job.date_scheduled ? job.date_scheduled.split('T')[0] : '',
            notes: job.notes || ''
        });
        setEditingId(job.id);

        // Fetch items
        const items = await dataService.getJobItems(job.id);
        setModalItems(items.map(i => ({
            description: i.description,
            quantity: i.quantity,
            unit_price: i.unit_price,
            type: i.type,
            inventory_id: i.inventory_id
        })));

        setIsModalOpen(true);
    };

    const handleDeleteClick = (id: string) => {
        setDeleteId(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        setIsDeleting(true);
        try {
            const { error } = await dataService.deleteJob(deleteId);
            if (!error) {
                setJobs(jobs.filter(j => j.id !== deleteId));
                setIsDeleteModalOpen(false);
                setDeleteId(null);
            } else {
                alert('Failed to delete job');
            }
        } catch (error) {
            console.error('Error deleting job:', error);
            alert('Failed to delete job');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleAddJob = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            let finalCustomerId = newJob.customer_id;

            // Handle inline customer creation
            if (isAddingNewCustomer && newCustomerData.name) {
                const { data: custData, error: custError } = await supabase
                    .from('customers')
                    .insert([{
                        name: newCustomerData.name,
                        phone: newCustomerData.phone || null,
                        email: newCustomerData.email || null,
                        address_line1: newCustomerData.address || null
                    }])
                    .select()
                    .single();

                if (custError) throw custError;
                if (!custData) throw new Error("Failed to create customer");

                finalCustomerId = custData.id;
            }

            const jobToSave = {
                customer_id: finalCustomerId,
                machine_details: newJob.service_type || 'General Service',
                problem_description: newJob.notes || null,
                status: newJob.status || 'Booked In',
                mechanic_id: newJob.engineer_name || null,
                date_scheduled: newJob.date_scheduled ? new Date(newJob.date_scheduled).toISOString() : null
            };

            let jobId = editingId;
            if (editingId) {
                // Update
                const { error } = await dataService.updateJob(editingId, jobToSave as any);
                if (error) throw error;

                // For updates, we'll keep it simple: delete old items and add new ones
                // (In a real app we might do a diff)
                await supabase.from('job_items').delete().eq('job_id', editingId);
            } else {
                // Create
                const { data, error } = await dataService.createJob(jobToSave as any);
                if (error) throw error;
                if (!data) throw new Error("Failed to create job");
                jobId = data.id;
            }

            // Save items if we have a jobId
            if (jobId && modalItems.length > 0) {
                const itemsToSave = modalItems.map(item => {
                    const { total, ...rest } = item; // Remove total as it's a generated column
                    return {
                        ...rest,
                        job_id: jobId
                    };
                });
                const { error: itemsError } = await dataService.addJobItems(itemsToSave);
                if (itemsError) throw itemsError;
            }

            fetchJobs();
            setIsModalOpen(false);
            setEditingId(null);
            setNewJob({
                customer_id: '',
                engineer_name: '',
                service_type: '',
                status: 'Booked In',
                date_scheduled: new Date().toISOString().split('T')[0],
                notes: ''
            });
            setModalItems([]);

        } catch (error) {
            console.error('Error saving job:', error);
            alert('Failed to save job.');
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Completed':
                return <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Completed</span>;
            case 'In Progress':
                return <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">In Progress</span>;
            case 'Waiting for Parts':
                return <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Waiting for Parts</span>;
            case 'Booked In':
                return <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Booked In</span>;
            default:
                return <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
        }
    };

    const filteredJobs = jobs.filter(job => {
        // Tab (Status) filtering
        const matchesTab = activeTab === 'all' || job.status === activeTab;

        // Search filtering
        const matchesSearch =
            job.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            job.service_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            job.engineer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            job.job_number?.toString().toLowerCase().includes(searchTerm.toLowerCase());

        return matchesTab && matchesSearch;
    });

    const getTabCount = (tab: string) => {
        if (tab === 'all') return jobs.length;
        return jobs.filter(j => j.status === tab).length;
    };

    return (
        <div className="space-y-6">
            {/* DESKTOP VIEW */}
            <div className="hidden md:block space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold font-display text-slate-900">Jobs & Services</h1>
                        <p className="text-slate-500">Track service calls and maintenance schedules</p>
                    </div>
                </div>

                <div className="section-card">
                    <div className="flex flex-col sm:flex-row justify-between items-center p-6 border-b border-slate-100 gap-4">
                        <h2 className="text-lg font-bold text-slate-900">Job List</h2>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <button className="btn btn-secondary text-sm">Export</button>
                            {isAdmin && (
                                <button onClick={() => {
                                    setEditingId(null);
                                    setNewJob({
                                        customer_id: '',
                                        engineer_name: '',
                                        service_type: '',
                                        status: 'Booked In',
                                        date_scheduled: new Date().toISOString().split('T')[0],
                                        notes: ''
                                    });
                                    setModalItems([]);
                                    setIsModalOpen(true);
                                }} className="btn btn-primary text-sm shadow-md shadow-green-900/10">
                                    + New Job
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="border-b border-slate-200 px-6">
                        <div className="flex gap-6 overflow-x-auto">
                            {['all', 'Booked In', 'In Progress', 'Waiting for Parts', 'Ready to Continue', 'Ready for Collection', 'Completed'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`py-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap capitalize
                                    ${activeTab === tab
                                            ? 'border-delaval-blue text-delaval-blue'
                                            : 'border-transparent text-slate-500 hover:text-slate-700'
                                        }`}
                                >
                                    {tab.replace('_', ' ')} ({getTabCount(tab)})
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="p-6">
                        <div className="relative mb-6">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Search jobs by customer, engineer, or job ID..."
                                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-[#F8FAFB] border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Job Details</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Service Type</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Engineer</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loading ? (
                                        <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">Loading jobs...</td></tr>
                                    ) : filteredJobs.map((job) => (
                                        <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-900">#{job.job_number}</div>
                                                <div className="text-xs text-slate-500">ID</div>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-slate-700">{job.customers?.name || 'Unknown'}</td>
                                            <td className="px-6 py-4 text-sm text-slate-600">{job.service_type}</td>
                                            <td className="px-6 py-4 text-sm text-slate-600">
                                                <div className="flex items-center gap-2">
                                                    <User size={14} className="text-slate-400" />
                                                    {job.engineer_name || 'Unassigned'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={14} className="text-slate-400" />
                                                    {job.date_scheduled ? new Date(job.date_scheduled).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {getStatusBadge(job.status)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex gap-2">
                                                    <Link to={`/jobs/${job.id}`} className="p-2 text-slate-400 hover:text-delaval-blue hover:bg-green-50 rounded-lg transition-colors inline-block" title="View Details">
                                                        <FileText size={18} />
                                                    </Link>


                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => handleEditClick(job)}
                                                            className="p-2 text-slate-400 hover:text-delaval-blue hover:bg-green-50 rounded-lg transition-colors"
                                                            title="Edit Job"
                                                        >
                                                            <Pencil size={18} />
                                                        </button>
                                                        {isAdmin && (
                                                            <button
                                                                onClick={() => handleDeleteClick(job.id)}
                                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                title="Delete Job"
                                                            >
                                                                <Trash2 size={18} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredJobs.length === 0 && !loading && (
                                        <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">No jobs found</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* MOBILE VIEW */}
            <div className="block md:hidden pb-24 bg-[#F8FAFB] min-h-screen text-[#1a1a1a]">

                {/* Page Title & Add Button - Adjusted for global header visibility */}
                <div className="px-5 pt-6 pb-2 flex justify-between items-center">
                    <h1 className="text-[28px] font-black text-slate-900 tracking-tight">Jobs</h1>
                    {isAdmin && (
                        <button
                            onClick={() => {
                                setEditingId(null);
                                setNewJob({
                                    customer_id: '',
                                    engineer_name: '',
                                    service_type: '',
                                    status: 'Booked In',
                                    date_scheduled: new Date().toISOString().split('T')[0],
                                    notes: ''
                                });
                                setModalItems([]);
                                setIsModalOpen(true);
                            }}
                            className="w-10 h-10 bg-[#0A8043] hover:bg-[#065F30] rounded-full flex items-center justify-center text-white shadow-md active:scale-95 transition-all"
                        >
                            <Plus size={20} />
                        </button>
                    )}
                </div>

                {/* Search Bar - Integrated into flow */}
                <div className="px-5 mb-4 mt-2">
                    <div className="bg-white rounded-2xl flex items-center px-4 py-3 border border-slate-200/60 focus-within:border-slate-300 transition-all shadow-sm">
                        <Search size={18} className="text-slate-400 mr-3 shrink-0" />
                        <input
                            type="text"
                            placeholder="Search jobs, clients, engineers..."
                            className="w-full bg-transparent border-none outline-none text-[15px] font-medium text-slate-900 placeholder-slate-400"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Status Tabs Slider - Sticky below global header */}
                <div className="sticky top-[60px] z-10 bg-[#F8FAFB]/95 backdrop-blur-sm pt-4 pb-3 border-b border-slate-100/50">
                    <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar px-5">
                        {['all', 'Booked In', 'In Progress', 'Waiting for Parts', 'Ready to Continue', 'Ready for Collection', 'Completed'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-5 py-2.5 rounded-[1rem] text-[13px] font-bold whitespace-nowrap transition-all shadow-sm
                                    ${activeTab === tab
                                        ? 'bg-slate-900 text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] active:scale-95'
                                        : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                                    }`}
                            >
                                {tab.replace('_', ' ')} <span className="opacity-60 ml-1">({getTabCount(tab)})</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Job Cards List */}
                <div className="px-5 space-y-3">
                    {loading ? (
                        <div className="text-center py-10 text-slate-400 font-medium text-sm">Loading jobs...</div>
                    ) : (
                        filteredJobs.map((job) => (
                            <Link key={job.id} to={`/jobs/${job.id}`} className="block bg-white border border-slate-100 rounded-[1.25rem] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] active:scale-[0.99] transition-transform">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="text-[11px] font-bold text-slate-400 tracking-wider">#{job.job_number}</div>
                                    <div className="flex items-center gap-1.5">
                                        {job.status === 'Completed' && <><div className="w-1.5 h-1.5 rounded-full bg-[#14A637]"></div><span className="text-[10px] font-bold uppercase tracking-wider text-[#14A637]">COMPLETED</span></>}
                                        {job.status === 'In Progress' && <><div className="w-1.5 h-1.5 rounded-full bg-[#FF6B00]"></div><span className="text-[10px] font-bold uppercase tracking-wider text-[#FF6B00]">IN PROGRESS</span></>}
                                        {job.status === 'Booked In' && <><div className="w-1.5 h-1.5 rounded-full bg-[#0A8043]"></div><span className="text-[10px] font-bold uppercase tracking-wider text-[#0A8043]">BOOKED IN</span></>}
                                        {job.status === 'Waiting for Parts' && <><div className="w-1.5 h-1.5 rounded-full bg-[#EAB308]"></div><span className="text-[10px] font-bold uppercase tracking-wider text-[#EAB308]">WAITING FOR PARTS</span></>}
                                        {job.status === 'Closed' && <><div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">CLOSED</span></>}
                                    </div>
                                </div>
                                <div className="mb-4">
                                    <h3 className="font-bold text-slate-900 text-[17px] leading-tight mb-1">{job.customers?.name || 'Unknown Customer'}</h3>
                                    <p className="text-[13px] text-slate-500">{job.customers?.address || 'No address provided'}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mb-4">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#E6F4EA] text-[#0A8043] text-[11px] font-bold tracking-wide">
                                        Pro Series 3000 {/* Mock Data matching design */}
                                    </span>
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold tracking-wide">
                                        {job.service_type}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center pt-3 border-t border-slate-50 text-[#64748B] text-[12px] font-semibold">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar size={13} className="text-slate-400" />
                                        <span>{job.date_scheduled ? new Date(job.date_scheduled).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Not set'}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <User size={13} className="text-slate-400" />
                                        <span>{job.engineer_name?.split(' ')[0] || 'Unassigned'}</span>
                                    </div>
                                </div>
                            </Link>
                        ))
                    )}
                    {filteredJobs.length === 0 && !loading && (
                        <div className="text-center py-10 text-slate-400 italic">No jobs found matching your criteria.</div>
                    )}
                </div>
            </div>

            <div className="hidden md:block">
                <Modal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title={editingId ? "Edit Job" : "Create New Job"}
                    size="wide"
                >
                    <form onSubmit={handleAddJob} className="space-y-4 md:space-y-6">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-slate-900">Customer Details</h3>
                                <button
                                    type="button"
                                    onClick={() => setIsAddingNewCustomer(!isAddingNewCustomer)}
                                    className="text-sm font-bold text-delaval-blue hover:text-green-800 transition-colors"
                                >
                                    {isAddingNewCustomer ? 'Select Existing Customer' : '+ Add New Customer'}
                                </button>
                            </div>

                            {isAddingNewCustomer ? (
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name / Farm *</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-delaval-blue/20 outline-none"
                                            value={newCustomerData.name}
                                            onChange={e => setNewCustomerData({ ...newCustomerData, name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                                        <input
                                            type="tel"
                                            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-delaval-blue/20 outline-none"
                                            value={newCustomerData.phone || ''}
                                            onChange={e => setNewCustomerData({ ...newCustomerData, phone: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                                        <textarea
                                            rows={2}
                                            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-delaval-blue/20 outline-none"
                                            value={newCustomerData.address || ''}
                                            onChange={e => setNewCustomerData({ ...newCustomerData, address: e.target.value })}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <SearchableSelect
                                    label="Select Existing Customer *"
                                    options={customers.map(c => ({ value: c.id, label: c.name }))}
                                    value={newJob.customer_id || ''}
                                    onChange={val => setNewJob({ ...newJob, customer_id: val })}
                                    placeholder="Search and select..."
                                    icon={<User size={16} />}
                                />
                            )}
                        </div>

                        <div className="bg-white p-4 rounded-xl border border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <h3 className="font-bold text-slate-900 mb-4">Job Details</h3>
                                <SearchableSelect
                                    label="Service Type"
                                    options={[
                                        { value: 'Machine Service', label: 'Machine Service' },
                                        { value: 'Breakdown', label: 'Breakdown' },
                                        { value: 'Emergency Call Out', label: 'Emergency Call Out' }
                                    ]}
                                    allowCustom={true}
                                    value={newJob.service_type || ''}
                                    onChange={val => setNewJob({ ...newJob, service_type: val })}
                                    icon={<FileText size={16} />}
                                />
                            </div>

                            <div className="col-span-1">
                                <SearchableSelect
                                    label="Assign Engineer"
                                    options={engineers.map(eng => ({ value: eng.name, label: eng.name }))}
                                    value={newJob.engineer_name || ''}
                                    onChange={val => setNewJob({ ...newJob, engineer_name: val })}
                                    icon={<Wrench size={16} />}
                                />
                            </div>

                            <div className="col-span-1">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                                <DatePicker
                                    required
                                    value={newJob.date_scheduled || ''}
                                    onChange={(date) => setNewJob({ ...newJob, date_scheduled: date })}
                                />
                            </div>

                            <div className="col-span-2">
                                <SearchableSelect
                                    label="Status"
                                    searchable={false}
                                    options={[
                                        { value: 'Booked In', label: 'Booked In' },
                                        { value: 'In Progress', label: 'In Progress' },
                                        { value: 'Waiting for Parts', label: 'Waiting for Parts' },
                                        { value: 'Ready to Continue', label: 'Ready to Continue' },
                                        { value: 'Ready for Collection', label: 'Ready for Collection' },
                                        { value: 'Completed', label: 'Completed' },
                                        { value: 'Closed', label: 'Closed' }
                                    ]}
                                    value={newJob.status || 'Booked In'}
                                    onChange={val => setNewJob({ ...newJob, status: val as Job['status'] })}
                                    icon={<Activity size={16} />}
                                />
                            </div>

                        </div>

                        {/* DESKTOP Line Items Editor */}
                        <div className="bg-white p-4 rounded-xl border border-slate-100">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-900">Parts & Labor</h3>
                                <div className="text-sm font-bold text-delaval-blue bg-green-50 px-3 py-1 rounded-full">
                                    Total: €{modalItems.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0).toFixed(2)}
                                </div>
                            </div>

                            <div className="space-y-3 mb-4">
                                {modalItems.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center p-3 border border-slate-200 rounded-lg">
                                        <div>
                                            <div className="font-medium text-slate-900">{item.description}</div>
                                            <div className="text-sm text-slate-500">Qty: {item.quantity} × €{item.unit_price.toFixed(2)}</div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="font-bold text-slate-900">€{(item.quantity * item.unit_price).toFixed(2)}</div>
                                            <button
                                                type="button"
                                                onClick={() => setModalItems(modalItems.filter((_, i) => i !== idx))}
                                                className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {modalItems.length === 0 && (
                                    <div className="text-center py-6 text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg">
                                        No items added yet. Search inventory below or add custom labor.
                                    </div>
                                )}
                            </div>

                            {isAddingCustom ? (
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                                    <div className="font-bold text-sm text-slate-700">Add Custom Item / Labor</div>
                                    <input
                                        type="text"
                                        placeholder="Description (e.g. Labor - 2 hours)"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-md outline-none focus:border-delaval-blue"
                                        value={newItem.description}
                                        onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                                    />
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Quantity</label>
                                            <input
                                                type="number"
                                                min="0.5"
                                                step="0.5"
                                                className="w-full px-3 py-2 border border-slate-300 rounded-md outline-none focus:border-delaval-blue"
                                                value={newItem.quantity}
                                                onChange={e => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Unit Price (€)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                className="w-full px-3 py-2 border border-slate-300 rounded-md outline-none focus:border-delaval-blue"
                                                value={newItem.unit_price}
                                                onChange={e => setNewItem({ ...newItem, unit_price: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsAddingCustom(false)}
                                            className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (newItem.description) {
                                                    setModalItems([...modalItems, { ...newItem, type: 'labor' }]);
                                                    setNewItem({ description: '', quantity: 1, unit_price: 0, type: 'part' });
                                                    setIsAddingCustom(false);
                                                }
                                            }}
                                            className="px-3 py-1.5 text-sm font-medium text-white bg-delaval-blue hover:bg-green-700 rounded-md transition-colors"
                                        >
                                            Add Custom Line
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-[1fr_auto] gap-3">
                                    <SearchableSelect
                                        label=""
                                        options={inventory.map(i => ({ value: i.id, label: `${i.name} (€${i.sell_price})` }))}
                                        value=""
                                        onChange={(id) => {
                                            const invItem = inventory.find(i => i.id === id);
                                            if (invItem) {
                                                setModalItems([...modalItems, {
                                                    description: invItem.name,
                                                    quantity: 1,
                                                    unit_price: invItem.sell_price,
                                                    type: 'part',
                                                    inventory_id: invItem.id
                                                }]);
                                            }
                                        }}
                                        placeholder="Search inventory parts..."
                                        icon={<Package size={16} />}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingCustom(true)}
                                        className="h-[42px] px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-colors flex justify-center gap-2 items-center"
                                    >
                                        <Plus size={16} /> Labor/Custom
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Job Description (formerly Notes), moved below Parts & Labor */}
                        <div className="bg-white p-4 rounded-xl border border-slate-100">
                            <label className="block text-sm font-bold text-slate-900 mb-2">Job Description</label>
                            <textarea
                                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-delaval-blue/20 outline-none text-slate-700 bg-slate-50 focus:bg-white transition-colors min-h-[100px]"
                                placeholder="Enter detailed job description or internal notes here..."
                                rows={3}
                                value={newJob.notes}
                                onChange={e => setNewJob({ ...newJob, notes: e.target.value })}
                            />
                        </div>

                        <div className="pt-4 flex justify-end gap-3">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                            <button type="submit" className="px-6 py-2 bg-delaval-blue hover:bg-delaval-dark-blue text-white rounded-lg font-bold shadow-lg shadow-green-900/10">
                                {editingId ? 'Save Changes' : 'Create Job'}
                            </button>
                        </div>
                    </form>
                </Modal>
            </div>

            {/* FULL SCREEN MOBILE MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-[#F8FAFB] z-[100] md:hidden flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 pt-12 pb-4 bg-white border-b border-slate-100 shrink-0">
                        <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 flex items-center justify-center text-slate-400 bg-slate-50 rounded-full hover:text-slate-600 transition-colors">
                            <div className="w-4 h-4 relative">
                                <span className="absolute left-0 top-1/2 w-4 h-0.5 bg-current -translate-y-1/2 rotate-45 rounded-full"></span>
                                <span className="absolute left-0 top-1/2 w-4 h-0.5 bg-current -translate-y-1/2 -rotate-45 rounded-full"></span>
                            </div>
                        </button>
                        <h2 className="text-lg font-bold text-slate-900 tracking-tight">{editingId ? "Edit Job" : "New Job"}</h2>
                        <div className="w-10"></div> {/* Spacer */}
                    </div>

                    {/* Form Content */}
                    <div className="flex-1 overflow-y-auto px-5 py-6">
                        <form id="mobile-job-form" onSubmit={handleAddJob} className="space-y-6 pb-24">

                            {/* Schedule Section */}
                            <div className="space-y-4">
                                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Schedule</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
                                        <div className="flex items-center gap-2 mb-2 text-[#0A8043]">
                                            <Calendar size={16} />
                                            <span className="font-bold text-sm">Date</span>
                                        </div>
                                        <input
                                            type="date"
                                            className="w-full text-slate-900 font-medium text-sm outline-none bg-transparent"
                                            value={newJob.date_scheduled || ''}
                                            onChange={(e) => setNewJob({ ...newJob, date_scheduled: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
                                        <div className="flex items-center gap-2 mb-2 text-[#FF6B00]">
                                            <Activity size={16} />
                                            <span className="font-bold text-sm">Status</span>
                                        </div>
                                        <select
                                            className="w-full text-slate-900 font-medium text-sm outline-none bg-transparent appearance-none"
                                            value={newJob.status || 'Booked In'}
                                            onChange={e => setNewJob({ ...newJob, status: e.target.value as Job['status'] })}
                                        >
                                            <option value="Booked In">Booked In</option>
                                            <option value="In Progress">In Progress</option>
                                            <option value="Waiting for Parts">Waiting for Parts</option>
                                            <option value="Ready to Continue">Ready to Continue</option>
                                            <option value="Ready for Collection">Ready for Collection</option>
                                            <option value="Completed">Completed</option>
                                            <option value="Closed">Closed</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Details Section */}
                            <div className="space-y-4">
                                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Details</label>
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] divide-y divide-slate-50">
                                    <div className="p-4">
                                        <div className="text-xs font-bold text-slate-500 mb-1">Service Type</div>
                                        <select
                                            className="w-full text-slate-900 font-bold text-[15px] outline-none bg-transparent"
                                            value={newJob.service_type || ''}
                                            onChange={e => setNewJob({ ...newJob, service_type: e.target.value })}
                                        >
                                            <option value="">Select Service Type...</option>
                                            <option value="Machine Service">Machine Service</option>
                                            <option value="Breakdown">Breakdown</option>
                                            <option value="Emergency Call Out">Emergency Call Out</option>
                                        </select>
                                    </div>
                                    <div className="p-4">
                                        <div className="text-xs font-bold text-slate-500 mb-1">Assigned Engineer</div>
                                        <select
                                            className="w-full text-slate-900 font-bold text-[15px] outline-none bg-transparent"
                                            value={newJob.engineer_name || ''}
                                            onChange={e => setNewJob({ ...newJob, engineer_name: e.target.value })}
                                        >
                                            <option value="">Select Engineer...</option>
                                            {engineers.map(eng => <option key={eng.id} value={eng.name}>{eng.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Customer Section */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between pl-1">
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest">Customer</label>
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingNewCustomer(!isAddingNewCustomer)}
                                        className="text-[11px] font-bold text-[#0A8043] uppercase tracking-wider"
                                    >
                                        {isAddingNewCustomer ? 'Select Existing' : 'Add New'}
                                    </button>
                                </div>
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-4">
                                    {isAddingNewCustomer ? (
                                        <div className="space-y-4">
                                            <div>
                                                <input
                                                    type="text"
                                                    placeholder="Customer Name *"
                                                    required
                                                    className="w-full text-slate-900 font-bold text-[15px] outline-none border-b border-slate-100 pb-2"
                                                    value={newCustomerData.name}
                                                    onChange={e => setNewCustomerData({ ...newCustomerData, name: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <input
                                                    type="tel"
                                                    placeholder="Phone Number"
                                                    className="w-full text-slate-900 text-[15px] outline-none border-b border-slate-100 pb-2"
                                                    value={newCustomerData.phone || ''}
                                                    onChange={e => setNewCustomerData({ ...newCustomerData, phone: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <textarea
                                                    placeholder="Full Address"
                                                    rows={2}
                                                    className="w-full text-slate-900 text-[15px] outline-none"
                                                    value={newCustomerData.address || ''}
                                                    onChange={e => setNewCustomerData({ ...newCustomerData, address: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <select
                                            className="w-full text-slate-900 font-bold text-[15px] outline-none bg-transparent"
                                            value={newJob.customer_id || ''}
                                            onChange={e => setNewJob({ ...newJob, customer_id: e.target.value })}
                                            required
                                        >
                                            <option value="">Select a customer...</option>
                                            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    )}
                                </div>
                            </div>

                            {/* Line Items Editor */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center pl-1">
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest">Parts & Labor</label>
                                    <div className="text-[11px] font-bold text-[#0A8043] bg-[#E6F4EA] px-2 py-0.5 rounded-full">
                                        Total: €{modalItems.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0).toFixed(2)}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {modalItems.map((item, idx) => (
                                        <div key={idx} className="bg-white p-3 rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-slate-900 text-sm truncate">{item.description}</div>
                                                <div className="text-xs text-slate-500 font-medium">Qty: {item.quantity} × €{item.unit_price.toFixed(2)}</div>
                                            </div>
                                            <div className="text-sm font-black text-slate-900 pr-2">€{(item.quantity * item.unit_price).toFixed(2)}</div>
                                            <button
                                                type="button"
                                                onClick={() => setModalItems(modalItems.filter((_, i) => i !== idx))}
                                                className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-500 shrink-0"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
                                    {isAddingCustom ? (
                                        <div className="space-y-3">
                                            <input
                                                type="text"
                                                placeholder="Item description..."
                                                className="w-full text-slate-900 text-[15px] font-medium outline-none border-b border-slate-100 pb-2"
                                                value={newItem.description}
                                                onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                                            />
                                            <div className="flex gap-4">
                                                <div className="flex-1">
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Qty</div>
                                                    <input
                                                        type="number"
                                                        className="w-full text-slate-900 text-[15px] font-medium outline-none border-b border-slate-100 pb-2"
                                                        value={newItem.quantity}
                                                        onChange={e => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || 0 })}
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Price (€)</div>
                                                    <input
                                                        type="number"
                                                        className="w-full text-slate-900 text-[15px] font-medium outline-none border-b border-slate-100 pb-2"
                                                        value={newItem.unit_price}
                                                        onChange={e => setNewItem({ ...newItem, unit_price: parseFloat(e.target.value) || 0 })}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2 pt-2">
                                                <button type="button" onClick={() => setIsAddingCustom(false)} className="px-4 py-2 text-xs font-bold text-slate-500 bg-slate-50 rounded-lg">Cancel</button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (newItem.description) {
                                                            setModalItems([...modalItems, { ...newItem, type: 'labor' }]);
                                                            setNewItem({ description: '', quantity: 1, unit_price: 0, type: 'part' });
                                                            setIsAddingCustom(false);
                                                        }
                                                    }}
                                                    className="px-4 py-2 text-xs font-bold text-white bg-[#0A8043] rounded-lg"
                                                >
                                                    Add Item
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <select
                                                className="w-full text-slate-900 font-bold text-[15px] outline-none bg-transparent"
                                                value=""
                                                onChange={(e) => {
                                                    const id = e.target.value;
                                                    const invItem = inventory.find(i => i.id === id);
                                                    if (invItem) {
                                                        setModalItems([...modalItems, {
                                                            description: invItem.name,
                                                            quantity: 1,
                                                            unit_price: invItem.sell_price,
                                                            type: 'part',
                                                            inventory_id: invItem.id
                                                        }]);
                                                    }
                                                }}
                                            >
                                                <option value="">Select an inventory item...</option>
                                                {inventory.map(i => <option key={i.id} value={i.id}>{i.name} (€{i.sell_price})</option>)}
                                            </select>

                                            <button
                                                type="button"
                                                onClick={() => setIsAddingCustom(true)}
                                                className="w-full py-3 bg-[#E6F4EA] text-[#0A8043] rounded-xl text-sm font-bold active:scale-[0.98] transition-transform flex justify-center gap-2 items-center"
                                            >
                                                <FileText size={16} />
                                                Add Custom / Labor
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Job Description Section (formerly Notes) */}
                            <div className="space-y-4">
                                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Job Description</label>
                                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
                                    <textarea
                                        className="w-full text-slate-900 text-[15px] outline-none bg-transparent min-h-[80px]"
                                        placeholder="Enter detailed job description or internal notes here..."
                                        value={newJob.notes || ''}
                                        onChange={e => setNewJob({ ...newJob, notes: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Removed from here to place below parts and labor */}
                        </form>
                    </div>

                    {/* Fixed Bottom Action Bar */}
                    <div className="fixed bottom-0 left-0 right-0 p-5 bg-white border-t border-slate-100 shrink-0 pb-8 rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.04)]">
                        <button
                            type="submit"
                            form="mobile-job-form"
                            className="w-full py-4 bg-[#0A8043] text-white rounded-[1.25rem] font-bold text-[15px] shadow-[0_8px_20px_rgba(0,81,165,0.25)] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                        >
                            {editingId ? 'Save Changes' : 'Create Job'}
                            <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Job"
                message="Are you sure you want to delete this job? This action cannot be undone."
                isDestructive={true}
                isLoading={isDeleting}
                confirmText="Delete Job"
            />
        </div>
    );
};

export default Jobs;
