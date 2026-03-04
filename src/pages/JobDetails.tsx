import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, FileText, Wrench, Clock, Package, Receipt, CheckCircle, Play, Pause, StopCircle } from 'lucide-react';
import SearchableSelect from '../components/SearchableSelect';
import { supabase } from '../lib/supabase';
import { Job, JobItem, InventoryItem } from '../types';

const JobDetails = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [job, setJob] = useState<Job | null>(null);
    const [items, setItems] = useState<JobItem[]>([]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [newItem, setNewItem] = useState({
        description: '',
        quantity: 1,
        unit_price: 0,
        type: 'part' as 'part' | 'labor'
    });

    const [timerStatus, setTimerStatus] = useState<'stopped' | 'running' | 'paused'>('stopped');
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    // Refresh timer logic when job updates
    useEffect(() => {
        if (job) {
            setTimerStatus(job.timer_status || 'stopped');
            if (job.timer_status === 'running' && job.timer_started_at) {
                const start = new Date(job.timer_started_at).getTime();
                const now = new Date().getTime();
                setElapsedSeconds(Math.floor((now - start) / 1000));
            } else {
                setElapsedSeconds(0);
            }
        }
    }, [job]);

    // Live timer ticking
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (timerStatus === 'running') {
            interval = setInterval(() => {
                setElapsedSeconds(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [timerStatus]);

    const formatTime = (totalSeconds: number) => {
        const totalHoursSoFar = (job?.total_hours_worked || 0) + (totalSeconds / 3600);
        const hrs = Math.floor(totalHoursSoFar);
        const mins = Math.floor((totalHoursSoFar - hrs) * 60);
        const secs = Math.floor(((totalHoursSoFar - hrs) * 60 - mins) * 60);
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleStartTimer = async () => {
        if (!job) return;
        const now = new Date().toISOString();
        const { error } = await supabase.from('jobs').update({ timer_status: 'running', timer_started_at: now }).eq('id', job.id);
        if (!error) {
            setJob({ ...job, timer_status: 'running', timer_started_at: now });
        }
    };

    const handlePauseTimer = async () => {
        if (!job || !job.timer_started_at) return;
        const end = new Date();
        const start = new Date(job.timer_started_at);
        const hoursThisSession = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        const newTotalHours = (job.total_hours_worked || 0) + hoursThisSession;

        // Auto-log to labour_logs
        await supabase.from('labour_logs').insert([{
            job_id: job.id,
            mechanic_id: 'auto_timer',
            start_time: job.timer_started_at,
            end_time: end.toISOString(),
            duration_minutes: Math.round(hoursThisSession * 60)
        }]);

        await supabase.from('jobs').update({ timer_status: 'paused', timer_started_at: null, total_hours_worked: newTotalHours }).eq('id', job.id);

        setJob({ ...job, timer_status: 'paused', timer_started_at: undefined, total_hours_worked: newTotalHours });
    };

    const handleCompleteJob = async () => {
        if (!job) return;
        if (timerStatus === 'running') {
            await handlePauseTimer();
        }
        const { error } = await supabase.from('jobs').update({ status: 'Completed', timer_status: 'stopped' }).eq('id', job.id);
        if (!error) {
            setJob(prev => prev ? { ...prev, status: 'Completed', timer_status: 'stopped' } : null);
        }
    };

    useEffect(() => {
        if (id) {
            fetchJobDetails();
            fetchJobItems();
            fetchInventory();
        }
    }, [id]);

    const fetchJobDetails = async () => {
        const { data, error } = await supabase
            .from('jobs')
            .select('*, customers(*)')
            .eq('id', id)
            .single();

        if (error) console.error('Error fetching job:', error);
        else setJob(data);
    };

    const fetchJobItems = async () => {
        const { data, error } = await supabase
            .from('job_items')
            .select('*')
            .eq('job_id', id);

        if (error) console.error('Error fetching items:', error);
        else setItems(data || []);
    };

    const fetchInventory = async () => {
        const { data } = await supabase.from('inventory').select('*').order('name');
        setInventory(data || []);
    };

    const handleAddItem = async () => {
        if (!id) return;
        try {
            const { total, ...itemWithoutTotal } = newItem as any;
            const itemToInsert = { ...itemWithoutTotal, job_id: id };

            const { data, error } = await supabase
                .from('job_items')
                .insert([itemToInsert])
                .select();

            if (error) throw error;
            if (data) {
                setItems([...items, data[0]]);
                setNewItem({ description: '', quantity: 1, unit_price: 0, type: 'part' });
            }
        } catch (error: any) {
            alert('Error adding item: ' + error.message);
        }
    };

    const handleDeleteItem = async (itemId: string) => {
        const { error } = await supabase.from('job_items').delete().eq('id', itemId);
        if (!error) setItems(items.filter(i => i.id !== itemId));
    };



    const [mobileTab, setMobileTab] = useState<'details' | 'parts' | 'labor'>('details');

    if (!job) return <div className="p-8">Loading...</div>;

    const partsItems = items.filter(i => i.type === 'part');
    const laborItems = items.filter(i => i.type === 'labor' || i.type === 'service');
    const totalPartsCost = partsItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const totalLaborCost = laborItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    return (
        <>
            {/* Desktop View */}
            <div className="hidden md:block space-y-6">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/jobs')} className="p-2 hover:bg-slate-100 rounded-full">
                        <ArrowLeft />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold font-display text-slate-900">Job #{job.job_number}</h1>
                        <p className="text-slate-500">{job.customers?.name}</p>
                    </div>
                    <div className="ml-auto flex gap-3">
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="section-card p-6">
                            <h2 className="text-lg font-bold mb-4">Service Items</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-4 py-2">Description</th>
                                            <th className="px-4 py-2">Qty</th>
                                            <th className="px-4 py-2">Cost</th>
                                            {job.status !== 'Completed' && <th className="px-4 py-2">Action</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map(item => (
                                            <tr key={item.id} className="border-t border-slate-100">
                                                <td className="px-4 py-3">{item.description}</td>
                                                <td className="px-4 py-3">{item.quantity}</td>
                                                <td className="px-4 py-3">€{item.unit_price}</td>
                                                {job.status !== 'Completed' && (
                                                    <td className="px-4 py-3">
                                                        <button onClick={() => handleDeleteItem(item.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {job.status !== 'Completed' && (
                                <div className="mt-4 bg-slate-50 p-4 rounded-lg space-y-3">
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <SearchableSelect
                                                label="Add Code / Product"
                                                options={inventory.map(inv => ({ value: inv.id, label: `${inv.name} (€${inv.sell_price})` }))}
                                                value=""
                                                onChange={(val) => {
                                                    const item = inventory.find(i => i.id === val);
                                                    if (item) {
                                                        setNewItem({
                                                            ...newItem,
                                                            description: item.name,
                                                            unit_price: item.sell_price,
                                                            type: 'part'
                                                        });
                                                    }
                                                }}
                                                placeholder="Select generic product..."
                                                icon={<Package size={16} />}
                                            />
                                        </div>
                                        <div className="w-1/3">
                                            <SearchableSelect
                                                label="Type"
                                                searchable={false}
                                                options={[
                                                    { value: 'part', label: 'Part' },
                                                    { value: 'labor', label: 'Labor' },
                                                    { value: 'service', label: 'Service' }
                                                ]}
                                                value={newItem.type}
                                                onChange={(val) => setNewItem({ ...newItem, type: val as any })}
                                                icon={<Clock size={16} />}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Description</label>
                                            <input
                                                className="w-full p-2 border rounded"
                                                placeholder="Item description or service details..."
                                                value={newItem.description}
                                                onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                                            />
                                        </div>
                                        <div className="w-20">
                                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Qty</label>
                                            <input
                                                type="number"
                                                className="w-full p-2 border rounded"
                                                value={newItem.quantity}
                                                onChange={e => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="w-24">
                                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Cost (€)</label>
                                            <input
                                                type="number"
                                                className="w-full p-2 border rounded"
                                                value={newItem.unit_price}
                                                onChange={e => setNewItem({ ...newItem, unit_price: Number(e.target.value) })}
                                            />
                                        </div>
                                        <button onClick={handleAddItem} className="bg-delaval-blue text-white p-2.5 rounded hover:bg-delaval-dark-blue">
                                            <Plus size={20} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="section-card p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-bold">Job Details</h2>
                                <div className={`text-xl font-bold font-mono px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm border ${timerStatus === 'running' ? 'bg-[#1a1a1a] text-[#E6F4EA] border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                    <Clock size={16} className={timerStatus === 'running' ? 'animate-pulse text-[#0A8043]' : ''} />
                                    {formatTime(timerStatus === 'running' ? elapsedSeconds : 0)}
                                </div>
                            </div>
                            <div className="space-y-4">
                                {/* Timer Controls */}
                                {job.status !== 'Completed' && (
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between gap-3">
                                        <div className="flex-1">
                                            {timerStatus !== 'running' ? (
                                                <button onClick={handleStartTimer} className="w-full flex justify-center items-center gap-2 bg-[#E6F4EA] text-[#0A8043] hover:bg-[#C1E7CD] py-2.5 rounded-lg font-bold transition-all shadow-sm border border-[#0A8043]/20">
                                                    <Play size={18} /> Start Timer
                                                </button>
                                            ) : (
                                                <button onClick={handlePauseTimer} className="w-full flex justify-center items-center gap-2 bg-[#FFC107] text-slate-900 hover:bg-[#E0A800] py-2.5 rounded-lg font-bold transition-all shadow-sm">
                                                    <Pause size={18} /> Pause Timer
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <button onClick={handleCompleteJob} className="w-full flex justify-center items-center gap-2 bg-[#0A8043] text-white hover:bg-[#065F30] py-2.5 rounded-lg font-bold transition-all shadow-sm">
                                                <CheckCircle size={18} /> Complete Job
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-slate-500 mb-2">Status</label>
                                    {job.status === 'Completed' ? (
                                        <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-2.5 rounded-lg border border-green-200 font-medium w-full">
                                            <CheckCircle size={18} /> Completed
                                        </div>
                                    ) : (
                                        <SearchableSelect
                                            label=""
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
                                            value={job.status}
                                            onChange={async (newStatus) => {
                                                const { error } = await supabase
                                                    .from('jobs')
                                                    .update({ status: newStatus })
                                                    .eq('id', job.id);

                                                if (!error) {
                                                    setJob({ ...job, status: newStatus as any });
                                                }
                                            }}
                                            icon={<Wrench size={16} />}
                                        />
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-500">Engineer</label>
                                    <div className="text-slate-900">{job.engineer_name || 'Unassigned'}</div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-500">Scheduled Date</label>
                                    <div className="text-slate-900">{job.date_scheduled ? new Date(job.date_scheduled).toLocaleDateString() : 'Unscheduled'}</div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-500">Job Description</label>
                                    <div className="text-slate-900 bg-slate-50 p-3 rounded-lg mt-1 text-sm">{job.notes || 'No description provided.'}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile View */}
            <div className="block md:hidden pb-24 bg-[#F8FAFB] min-h-screen text-[#1a1a1a]">
                {/* Mobile Header */}
                <div className="bg-white px-4 py-4 flex items-center justify-between sticky top-0 z-20 border-b border-slate-100">
                    <button onClick={() => navigate('/jobs')} className="p-2 -ml-2 text-slate-600 hover:bg-slate-50 rounded-full">
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-lg font-bold font-display text-slate-900 truncate flex-1 text-center mr-8">
                        {job.customers?.name || `Job #${job.job_number}`}
                    </h1>
                </div>

                {/* Mobile Content */}
                <div className="p-4 space-y-6">
                    {/* Customer & Job Info Header */}
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-delaval-blue text-white rounded-xl flex items-center justify-center text-xl font-bold">
                            {job.customers?.name?.substring(0, 2).toUpperCase() || 'JB'}
                        </div>
                        <div>
                            <h2 className="font-bold text-lg leading-tight">{job.customers?.name}</h2>
                            <p className="text-sm text-slate-500">{job.customers?.address?.split(',')[0]}, {job.customers?.address?.split(',').pop()?.trim()}</p>
                            <p className="text-sm text-delaval-blue font-medium mt-0.5">
                                📞 {job.customers?.phone || 'No phone'}
                            </p>
                        </div>
                    </div>

                    {/* Status Update */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Current Status</label>
                        {job.status === 'Completed' ? (
                            <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-3 rounded-lg border border-green-200 font-bold">
                                <CheckCircle size={18} /> Completed
                            </div>
                        ) : (
                            <SearchableSelect
                                label=""
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
                                value={job.status}
                                onChange={async (newStatus) => {
                                    const { error } = await supabase
                                        .from('jobs')
                                        .update({ status: newStatus })
                                        .eq('id', job.id);
                                    if (!error) {
                                        setJob({ ...job, status: newStatus as any });
                                    }
                                }}
                            />
                        )}
                    </div>

                    {/* Equipment Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Equipment</h3>
                        </div>
                        <div className="p-4">
                            <div className="flex justify-between items-center py-2 border-b border-slate-50">
                                <span className="text-sm text-slate-500">Machine</span>
                                <span className="text-sm font-bold text-slate-900 text-right">STIHL iMOW 7.0</span> {/* Hardcoded mock data matching design */}
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-50">
                                <span className="text-sm text-slate-500">Serial</span>
                                <span className="text-sm font-bold text-slate-900 text-right">VMS-2019-00412</span> {/* Hardcoded mock data matching design */}
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-sm text-slate-500">Installed</span>
                                <span className="text-sm font-bold text-slate-900 text-right">Mar 2025</span> {/* Hardcoded mock data matching design */}
                            </div>
                        </div>
                    </div>

                    {/* Service Tabs */}
                    <div className="flex border-b border-slate-200 sticky top-[64px] bg-[#F8FAFB] z-10 pt-2 px-4">
                        <button
                            className={`flex-1 pb-3 text-sm font-bold text-center border-b-2 transition-colors ${mobileTab === 'details' ? 'border-delaval-blue text-delaval-blue' : 'border-transparent text-slate-500'}`}
                            onClick={() => setMobileTab('details')}
                        >
                            DETAILS
                        </button>
                        <button
                            className={`flex-1 pb-3 text-sm font-bold text-center border-b-2 transition-colors ${mobileTab === 'parts' ? 'border-delaval-blue text-delaval-blue' : 'border-transparent text-slate-500'}`}
                            onClick={() => setMobileTab('parts')}
                        >
                            PARTS
                        </button>
                        <button
                            className={`flex-1 pb-3 text-sm font-bold text-center border-b-2 transition-colors ${mobileTab === 'labor' ? 'border-delaval-blue text-delaval-blue' : 'border-transparent text-slate-500'}`}
                            onClick={() => setMobileTab('labor')}
                        >
                            LABOUR
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="pt-2">
                        {mobileTab === 'details' && (
                            <div className="space-y-4">
                                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Issue Description</h3>
                                    <p className="text-sm text-slate-700">{job.notes || 'No description provided.'}</p>
                                </div>
                                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Schedule & Assignment</h3>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Date</span>
                                            <span className="font-medium">{job.date_scheduled ? new Date(job.date_scheduled).toLocaleDateString() : 'Unscheduled'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Engineer</span>
                                            <span className="font-medium">{job.engineer_name || 'Unassigned'}</span>
                                        </div>
                                    </div>
                                </div>
                                {/* Actions */}
                                {job.status !== 'Completed' && (
                                    <div className="mt-6 space-y-3">
                                        {timerStatus !== 'running' ? (
                                            <button onClick={handleStartTimer} className="w-full flex items-center justify-center gap-2 bg-[#E6F4EA] text-[#0A8043] border border-[#0A8043]/20 py-3 rounded-xl font-bold text-sm shadow-sm transition-colors">
                                                <Play size={18} /> Start Timer
                                            </button>
                                        ) : (
                                            <button onClick={handlePauseTimer} className="w-full flex items-center justify-center gap-2 bg-[#FFC107] text-slate-900 py-3 rounded-xl font-bold text-sm shadow-sm transition-colors">
                                                <Pause size={18} /> Pause Timer
                                            </button>
                                        )}

                                        <button onClick={handleCompleteJob} className="w-full flex items-center justify-center gap-2 bg-[#0A8043] text-white py-3 rounded-xl font-bold text-sm shadow-md shadow-[#0A8043]/10">
                                            <CheckCircle size={18} /> Complete Job
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {mobileTab === 'parts' && (
                            <div className="space-y-4">
                                {/* Add Part Form (Mobile logic reused from desktop) */}
                                {job.status !== 'Completed' && (
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-6 space-y-3">
                                        <h3 className="text-sm font-bold text-slate-900">Add Part</h3>
                                        <SearchableSelect
                                            label=""
                                            options={inventory.map(inv => ({ value: inv.id, label: `${inv.name} (€${inv.sell_price})` }))}
                                            value=""
                                            onChange={(val) => {
                                                const item = inventory.find(i => i.id === val);
                                                if (item) {
                                                    setNewItem({
                                                        ...newItem,
                                                        description: item.name,
                                                        unit_price: item.sell_price,
                                                        type: 'part'
                                                    });
                                                }
                                            }}
                                            placeholder="Search parts catalog..."
                                        />
                                        <div className="flex gap-3 pt-2">
                                            <div className="w-1/3">
                                                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Qty</label>
                                                <input
                                                    type="number"
                                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                                    value={newItem.quantity}
                                                    onChange={e => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                                                />
                                            </div>
                                            <div className="w-1/3">
                                                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Price (€)</label>
                                                <input
                                                    type="number"
                                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                                    value={newItem.unit_price}
                                                    onChange={e => setNewItem({ ...newItem, unit_price: Number(e.target.value) })}
                                                />
                                            </div>
                                            <div className="w-1/3 flex items-end">
                                                <button
                                                    onClick={() => {
                                                        setNewItem(prev => ({ ...prev, type: 'part' }));
                                                        handleAddItem();
                                                    }}
                                                    className="w-full bg-delaval-blue text-white p-2.5 rounded-lg flex items-center justify-center hover:bg-delaval-dark-blue h-[42px]"
                                                >
                                                    <Plus size={20} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Parts List */}
                                <div className="flex justify-between items-center px-1 mb-2">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Used Parts ({partsItems.length})</span>
                                    <span className="text-sm font-bold text-slate-900">Total: €{totalPartsCost.toFixed(2)}</span>
                                </div>
                                <div className="space-y-3">
                                    {partsItems.length === 0 ? (
                                        <p className="text-sm text-slate-500 text-center py-4 bg-white rounded-xl border border-slate-100">No parts added yet.</p>
                                    ) : (
                                        partsItems.map(item => (
                                            <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center group">
                                                <div>
                                                    <div className="font-bold text-slate-900 text-sm">{item.description}</div>
                                                    <div className="text-sm text-slate-500 mt-0.5">Qty {item.quantity} × €{item.unit_price}</div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-bold text-slate-900">€{(item.quantity * item.unit_price).toFixed(2)}</span>
                                                    {job.status !== 'Completed' && (
                                                        <button onClick={() => handleDeleteItem(item.id)} className="text-slate-300 hover:text-red-500 p-2">
                                                            <Trash2 size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {mobileTab === 'labor' && (
                            <div className="space-y-4">
                                {/* Add Labor Form */}
                                {job.status !== 'Completed' && (
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-6 space-y-3">
                                        <h3 className="text-sm font-bold text-slate-900">Add Time/Labour</h3>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Description</label>
                                            <input
                                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                                placeholder="e.g. Travel time, Service hours..."
                                                value={newItem.description}
                                                onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                                            />
                                        </div>
                                        <div className="flex gap-3 pt-2">
                                            <div className="w-1/3">
                                                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Hours</label>
                                                <input
                                                    type="number"
                                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                                    value={newItem.quantity}
                                                    onChange={e => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                                                />
                                            </div>
                                            <div className="w-1/3">
                                                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Rate (€)</label>
                                                <input
                                                    type="number"
                                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                                    value={newItem.unit_price}
                                                    onChange={e => setNewItem({ ...newItem, unit_price: Number(e.target.value) })}
                                                />
                                            </div>
                                            <div className="w-1/3 flex items-end">
                                                <button
                                                    onClick={() => {
                                                        setNewItem(prev => ({ ...prev, type: 'labor' }));
                                                        handleAddItem();
                                                    }}
                                                    className="w-full bg-delaval-blue text-white p-2.5 rounded-lg flex items-center justify-center hover:bg-delaval-dark-blue h-[42px]"
                                                >
                                                    <Plus size={20} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Labor List */}
                                <div className="flex justify-between items-center px-1 mb-2">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Labour Log ({laborItems.length})</span>
                                    <span className="text-sm font-bold text-slate-900">Total: €{totalLaborCost.toFixed(2)}</span>
                                </div>
                                <div className="space-y-3">
                                    {laborItems.length === 0 ? (
                                        <p className="text-sm text-slate-500 text-center py-4 bg-white rounded-xl border border-slate-100">No time added yet.</p>
                                    ) : (
                                        laborItems.map(item => (
                                            <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
                                                <div>
                                                    <div className="font-bold text-slate-900 text-sm">{item.description}</div>
                                                    <div className="text-sm text-slate-500 mt-0.5">{item.quantity} hrs @ €{item.unit_price}/hr</div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-bold text-slate-900">€{(item.quantity * item.unit_price).toFixed(2)}</span>
                                                    {job.status !== 'Completed' && (
                                                        <button onClick={() => handleDeleteItem(item.id)} className="text-slate-300 hover:text-red-500 p-2">
                                                            <Trash2 size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default JobDetails;
