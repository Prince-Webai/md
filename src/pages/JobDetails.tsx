import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, FileText, Wrench, Clock, Package, Receipt, CheckCircle, Play, Pause, StopCircle, Download, Printer, UserCheck, FileCheck } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import SearchableSelect from '../components/SearchableSelect';
import { supabase } from '../lib/supabase';
import { Job, JobItem, InventoryItem, Settings } from '../types';
import { dataService } from '../services/dataService';

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

    // Report State
    const [isGenerating, setIsGenerating] = useState(false);
    const [recommendations, setRecommendations] = useState('');
    const [mechanicSignOff, setMechanicSignOff] = useState('');
    const [settings, setSettings] = useState<Settings | null>(null);

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
            loadSettings();
        }
    }, [id]);

    const loadSettings = async () => {
        const s = await dataService.getSettings();
        setSettings(s);
    };

    const fetchJobDetails = async () => {
        const { data, error } = await supabase
            .from('jobs')
            .select('*, customers(*)')
            .eq('id', id)
            .single();

        if (error) console.error('Error fetching job:', error);
        else {
            setJob(data);
            setRecommendations(data.recommendations || '');
            setMechanicSignOff(data.mechanic_sign_off_name || '');
        }
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

    const uploadPDFToStorage = async (doc: jsPDF, fileName: string) => {
        try {
            const pdfBlob = doc.output('blob');
            const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
            const filePath = `${job?.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('job-documents')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data } = supabase.storage
                .from('job-documents')
                .getPublicUrl(filePath);

            return data.publicUrl;
        } catch (error) {
            console.error('Error uploading PDF:', error);
            return null;
        }
    };

    const generateJobSheet = async () => {
        if (!job) return;
        setIsGenerating(true);
        try {
            // Use current settings or fallback defaults
            const s = settings || {
                company_name: 'MD Burke Ltd',
                company_address: 'Workshop Address',
                company_phone: 'Professional Service',
                company_email: 'service@mdburke.ie'
            };

            const doc = new jsPDF();
            const primaryColor: [number, number, number] = [10, 128, 67]; // DeLaval Green

            // Header
            doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.rect(0, 0, 210, 40, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.text('JOB WORKSHEET', 14, 25);
            doc.setFontSize(10);
            doc.text(`Job Number: #${job.job_number}`, 14, 32);

            // Company info (Right aligned)
            doc.setFontSize(10);
            doc.text(s.company_name, 196, 15, { align: 'right' });
            doc.setFont('helvetica', 'normal');
            doc.text(s.company_address || '', 196, 20, { align: 'right' });
            doc.text(`Tel: ${s.company_phone || ''}`, 196, 25, { align: 'right' });

            // Content
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'bold');
            doc.text('CUSTOMER DETAILS', 14, 50);
            doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.line(14, 52, 60, 52);

            doc.setFont('helvetica', 'normal');
            doc.text(`Name: ${job.customers?.name}`, 14, 60);
            doc.text(`Address: ${job.customers?.address || 'N/A'}`, 14, 65);
            doc.text(`Phone: ${job.customers?.phone || 'N/A'}`, 14, 70);

            doc.setFont('helvetica', 'bold');
            doc.text('EQUIPMENT / PROBLEM', 14, 85);
            doc.line(14, 87, 65, 87);
            doc.setFont('helvetica', 'normal');
            doc.text(`Machine: ${job.machine_details || 'N/A'}`, 14, 95);
            doc.text('Description:', 14, 100);
            const splitProblem = doc.splitTextToSize(job.problem_description || 'No description provided.', 180);
            doc.text(splitProblem, 14, 105);

            // Parts Reserved/Used
            doc.setFont('helvetica', 'bold');
            doc.text('PARTS / MATERIALS', 14, 130);
            autoTable(doc, {
                startY: 135,
                head: [['Description', 'Qty']],
                body: items.filter(i => i.type === 'part').map(i => [i.description, i.quantity.toString()]),
                headStyles: { fillColor: primaryColor }
            });

            // Footer
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`Generated on ${new Date().toLocaleString()}`, 14, 285);

            doc.save(`JobSheet_${job.job_number}.pdf`);
            const url = await uploadPDFToStorage(doc, `JobSheet_${job.job_number}.pdf`);
            if (url) {
                await supabase.from('jobs').update({ job_sheet_pdf_url: url }).eq('id', job.id);
            }
        } catch (error: any) {
            console.error('PDF Generation Error:', error);
            alert('Could not generate PDF: ' + error.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const generateCompletionReport = async () => {
        if (!job) return;
        setIsGenerating(true);
        try {
            const s = settings || {
                company_name: 'MD Burke Ltd',
                company_address: 'Workshop Address',
                company_phone: 'Professional Service',
                company_email: 'service@mdburke.ie'
            };

            const doc = new jsPDF();
            const primaryColor: [number, number, number] = [10, 128, 67];

            // Header
            doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.rect(0, 0, 210, 45, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.text('SERVICE COMPLETION REPORT', 14, 25);
            doc.setFontSize(10);
            doc.text(`Job Number: #${job.job_number} | Filterable ID: ${job.id.substring(0, 8)}`, 14, 33);

            // Company info
            doc.text(s.company_name, 196, 15, { align: 'right' });
            doc.setFont('helvetica', 'normal');
            doc.text(s.company_address || '', 196, 20, { align: 'right' });
            doc.text(`Email: ${s.company_email || ''}`, 196, 25, { align: 'right' });

            doc.setTextColor(0, 0, 0);

            //Summary
            const completionDate = new Date().toLocaleDateString();
            const labourHours = (job.total_hours_worked || 0).toFixed(2);

            autoTable(doc, {
                startY: 55,
                body: [
                    ['Customer', job.customers?.name || 'N/A'],
                    ['Date Completed', completionDate],
                    ['Engineer', job.engineer_name || 'N/A'],
                    ['Labour Hours', labourHours]
                ],
                theme: 'plain',
                styles: { fontSize: 10, cellPadding: 2 }
            });

            const finalSummaryY = (doc as any).lastAutoTable.finalY || 55;

            // Work Done
            doc.setFont('helvetica', 'bold');
            doc.text('WORK PERFORMED', 14, finalSummaryY + 15);
            const workDone = doc.splitTextToSize(job.problem_description || 'General Service', 180);
            doc.setFont('helvetica', 'normal');
            doc.text(workDone, 14, finalSummaryY + 22);

            // Parts Table
            const finalWorkY = finalSummaryY + 22 + (workDone.length * 5);
            doc.setFont('helvetica', 'bold');
            doc.text('PARTS & MATERIALS USED', 14, finalWorkY + 10);

            autoTable(doc, {
                startY: finalWorkY + 15,
                head: [['Part Description', 'Quantity', 'Unit Price', 'Total']],
                body: items.filter(i => i.type === 'part').map(i => [
                    i.description,
                    i.quantity.toString(),
                    `EUR ${i.unit_price.toFixed(2)}`,
                    `EUR ${(i.quantity * i.unit_price).toFixed(2)}`
                ]),
                headStyles: { fillColor: primaryColor }
            });

            const finalPartsY = (doc as any).lastAutoTable.finalY || finalWorkY + 15;

            // Recommendations
            doc.setFont('helvetica', 'bold');
            doc.text('RECOMMENDATIONS / FUTURE WORK', 14, finalPartsY + 15);
            doc.setFont('helvetica', 'normal');
            const recs = doc.splitTextToSize(recommendations || 'System functioning correctly. No further work required at this time.', 180);
            doc.text(recs, 14, finalPartsY + 22);

            // Sign-off
            const finalRecsY = finalPartsY + 22 + (recs.length * 5);
            doc.setFont('helvetica', 'bold');
            doc.text('MECHANIC SIGN-OFF', 14, finalRecsY + 15);
            doc.setFont('helvetica', 'normal');
            doc.text(`Name: ${mechanicSignOff || job.engineer_name || 'N/A'}`, 14, finalRecsY + 23);
            doc.text('Signature: __________________________', 120, finalRecsY + 23);

            doc.save(`CompletionReport_${job.job_number}.pdf`);
            const url = await uploadPDFToStorage(doc, `CompletionReport_${job.job_number}.pdf`);
            if (url) {
                await supabase.from('jobs').update({
                    completion_report_pdf_url: url,
                    recommendations,
                    mechanic_sign_off_name: mechanicSignOff
                }).eq('id', job.id);
            }
        } catch (error: any) {
            console.error('PDF Generation Error:', error);
            alert('Could not generate completion report: ' + (error.message || error));
        } finally {
            setIsGenerating(false);
        }
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
                        {job.status !== 'Completed' && job.status !== 'Closed' && (
                            <button
                                onClick={generateJobSheet}
                                disabled={isGenerating}
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition-all shadow-sm"
                            >
                                <Printer size={18} />
                                {isGenerating ? 'Generating...' : 'Print Job Sheet'}
                            </button>
                        )}
                        {job.status === 'Completed' && (
                            <button
                                onClick={generateCompletionReport}
                                disabled={isGenerating}
                                className="flex items-center gap-2 px-4 py-2 bg-delaval-blue text-white rounded-lg font-semibold hover:bg-delaval-dark-blue transition-all shadow-sm"
                            >
                                <FileCheck size={18} />
                                {isGenerating ? 'Generating...' : 'Completion Report'}
                            </button>
                        )}
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

                                {/* Report Completion Info */}
                                {job.status === 'Completed' && (
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                            <Receipt size={18} className="text-[#0A8043]" />
                                            Report Information
                                        </h3>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">Mechanic Sign-off</label>
                                            <div className="relative">
                                                <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                                <input
                                                    type="text"
                                                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-delaval-blue transition-all"
                                                    placeholder="Enter mechanic name..."
                                                    value={mechanicSignOff}
                                                    onChange={e => setMechanicSignOff(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">Future Recommendations</label>
                                            <textarea
                                                className="w-full p-4 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-delaval-blue transition-all min-h-[100px]"
                                                placeholder="Enter any additional advice for the customer..."
                                                value={recommendations}
                                                onChange={e => setRecommendations(e.target.value)}
                                            />
                                        </div>
                                        <button
                                            onClick={generateCompletionReport}
                                            disabled={isGenerating}
                                            className="w-full flex justify-center items-center gap-2 bg-[#1a1a1a] text-white hover:bg-black py-2.5 rounded-lg font-bold transition-all shadow-md"
                                        >
                                            <Download size={18} /> {isGenerating ? 'Updating PDF...' : 'Update Completion Report'}
                                        </button>
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

                                {/* PDF Links */}
                                {(job.job_sheet_pdf_url || job.completion_report_pdf_url) && (
                                    <div className="pt-4 border-t border-slate-100 space-y-2">
                                        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 pl-1">Generated Documents</h3>
                                        {job.job_sheet_pdf_url && (
                                            <a href={job.job_sheet_pdf_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-slate-100 transition-colors group">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                                                        <FileText size={16} />
                                                    </div>
                                                    <span className="text-sm font-medium text-slate-700">Job Worksheet</span>
                                                </div>
                                                <Download size={16} className="text-slate-400 group-hover:text-delaval-blue" />
                                            </a>
                                        )}
                                        {job.completion_report_pdf_url && (
                                            <a href={job.completion_report_pdf_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-slate-100 transition-colors group">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                                                        <FileCheck size={16} />
                                                    </div>
                                                    <span className="text-sm font-medium text-slate-700">Completion Report</span>
                                                </div>
                                                <Download size={16} className="text-slate-400 group-hover:text-delaval-blue" />
                                            </a>
                                        )}
                                    </div>
                                )}
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
                                <span className="text-sm font-bold text-slate-900 text-right">EQ-2019-00412</span> {/* Hardcoded mock data matching design */}
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
                                {job.status !== 'Completed' && job.status !== 'Closed' && (
                                    <div className="mt-6 space-y-3">
                                        <button
                                            onClick={generateJobSheet}
                                            disabled={isGenerating}
                                            className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 py-3 rounded-xl font-bold text-sm shadow-sm transition-colors"
                                        >
                                            <Printer size={18} /> {isGenerating ? 'Generating...' : 'Job Sheet (PDF)'}
                                        </button>

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

                                {job.status === 'Completed' && (
                                    <div className="mt-6 space-y-3">
                                        <button
                                            onClick={generateCompletionReport}
                                            disabled={isGenerating}
                                            className="w-full flex items-center justify-center gap-2 bg-delaval-blue text-white py-3 rounded-xl font-bold text-sm shadow-md"
                                        >
                                            <FileCheck size={18} /> {isGenerating ? 'Generating...' : 'Completion Report'}
                                        </button>

                                        <div className="bg-white p-4 rounded-xl border border-slate-100 space-y-4">
                                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Report Data</h3>
                                            <input
                                                type="text"
                                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                                placeholder="Sign-off Name"
                                                value={mechanicSignOff}
                                                onChange={e => setMechanicSignOff(e.target.value)}
                                            />
                                            <textarea
                                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm min-h-[80px]"
                                                placeholder="Recommendations"
                                                value={recommendations}
                                                onChange={e => setRecommendations(e.target.value)}
                                            />
                                        </div>
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
