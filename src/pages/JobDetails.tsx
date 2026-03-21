import { useEffect, useState, Fragment } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, FileText, Wrench, Clock, Package, Receipt, CheckCircle, Play, Pause, StopCircle, Download, Printer, UserCheck, FileCheck, AlertCircle, AlertTriangle, Settings } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import SearchableSelect from '../components/SearchableSelect';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { Job, JobItem, InventoryItem, Settings as GlobalSettings } from '../types';
import { dataService } from '../services/dataService';

const JobDetails = () => {
    const { showToast } = useToast();
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

    const [currentTime, setCurrentTime] = useState(new Date().getTime());
    const [timerStatus, setTimerStatus] = useState<'stopped' | 'running' | 'paused'>('stopped');
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    // Report State
    const [isGenerating, setIsGenerating] = useState(false);
    const [diagnosisNotes, setDiagnosisNotes] = useState('');
    const [repairSummary, setRepairSummary] = useState('');
    const [recommendations, setRecommendations] = useState('');
    const [mechanicSignOff, setMechanicSignOff] = useState('');
    const [timeLeft, setTimeLeft] = useState<string>('');
    const [settings, setSettings] = useState<GlobalSettings | null>(null);
    const [history, setHistory] = useState<Job[]>([]);
    const [activeTab, setActiveTab] = useState<'items' | 'history' | 'labor'>('items');
    const [mobileTab, setMobileTab] = useState<'details' | 'parts' | 'labor' | 'history'>('details');
    const [engineers, setEngineers] = useState<any[]>([]);
    const [labourLogs, setLabourLogs] = useState<any[]>([]);
    const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
    const [selectedCompletionCategory, setSelectedCompletionCategory] = useState('');

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
        const interval = setInterval(() => {
            setCurrentTime(new Date().getTime());
            if (timerStatus === 'running') {
                setElapsedSeconds(prev => prev + 1);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [timerStatus]);

    const formatTime = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = Math.floor(totalSeconds % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const handleStartTimer = async () => {
        if (!job) return;

        // Ensure a mechanic is assigned before starting
        if (!job.engineer_name) {
            showToast('Action Required', 'Please assign a mechanic/engineer before starting the timer.', 'error');
            return;
        }

        const now = new Date().toISOString();
        const updates: any = { timer_status: 'running', timer_started_at: now };

        // Record actual start time if it's the first time starting the timer
        if (!job.actual_start_time) {
            updates.actual_start_time = now;
        }

        const { error } = await supabase.from('jobs').update(updates).eq('id', job.id);
        if (!error) {
            setJob({ ...job, ...updates });
        }
    };

    const handlePauseTimer = async () => {
        if (!job || !job.timer_started_at) return;
        const end = new Date();
        const start = new Date(job.timer_started_at);
        const hoursThisSession = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        const newTotalHours = (job.total_hours_worked || 0) + hoursThisSession;

        await supabase.from('labour_logs').insert([{
            job_id: job.id,
            mechanic_id: job.engineer_name || 'Unassigned',
            start_time: job.timer_started_at,
            end_time: end.toISOString(),
            duration_minutes: Math.round(hoursThisSession * 60)
        }]);

        await supabase.from('jobs').update({ 
            timer_status: 'paused', 
            timer_started_at: null, 
            total_hours_worked: newTotalHours 
        }).eq('id', job.id);

        setJob({ ...job, timer_status: 'paused', timer_started_at: undefined, total_hours_worked: newTotalHours });
        fetchJobItems();
        fetchLabourLogs();
        showToast('Session Paused', `Logged ${Math.round(hoursThisSession * 60)} minutes to work history.`, 'success');
    };

    const handleStopTimer = async () => {
        if (!job) return;
        
        const updates: any = { timer_status: 'stopped' };
        
        if (job.timer_started_at) {
            const end = new Date();
            const start = new Date(job.timer_started_at);
            const hoursThisSession = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
            const newTotalHours = (job.total_hours_worked || 0) + hoursThisSession;
            
            await supabase.from('labour_logs').insert([{
                job_id: job.id,
                mechanic_id: job.engineer_name || 'Unassigned',
                start_time: job.timer_started_at,
                end_time: end.toISOString(),
                duration_minutes: Math.round(hoursThisSession * 60)
            }]);
            
            updates.total_hours_worked = newTotalHours;
            updates.timer_started_at = null;
        }

        const { error } = await supabase.from('jobs').update(updates).eq('id', job.id);
        if (!error) {
            setJob({ ...job, ...updates });
            fetchJobItems();
            fetchLabourLogs();
            if (updates.timer_status === 'stopped' && updates.total_hours_worked) {
                showToast('Session Stopped', 'Final session logged to work history.', 'success');
            }
        }
    };

    const handleCompleteJob = async (categoryOverride?: string) => {
        if (!job) return;

        // If no category selected, open modal
        if (!categoryOverride && !selectedCompletionCategory) {
            setIsCompletionModalOpen(true);
            return;
        }

        const category = categoryOverride || selectedCompletionCategory;

        if (timerStatus === 'running') {
            await handlePauseTimer();
        }
        
        // Finalize labor (rounding up to next full hour)
        const totalRawHours = job.total_hours_worked || 0;
        const roundedHours = Math.ceil(totalRawHours) || 1; // Minimum 1 hour if any work done
        const laborRate = 50;
        
        // Create/Update labor item
        const existingLabor = items.find(i => i.type === 'labor');
        if (existingLabor) {
            await supabase.from('job_items').update({
                quantity: roundedHours,
                unit_price: laborRate,
                total: roundedHours * laborRate
            }).eq('id', existingLabor.id);
        } else if (totalRawHours > 0) {
            await dataService.addJobItem({
                job_id: job.id,
                description: `Labour (${roundedHours} hrs rounded from ${totalRawHours.toFixed(2)})`,
                quantity: roundedHours,
                unit_price: laborRate,
                type: 'labor'
            });
        }

        const now = new Date().toISOString();
        const { error } = await supabase.from('jobs').update({
            status: 'Completed',
            timer_status: 'stopped',
            actual_end_time: now,
            total_hours_worked: totalRawHours, // Keep raw hours for record, billable is in items
            service_type: category // Standardized category (Requirement 9)
        }).eq('id', job.id);

        if (!error) {
            setJob(prev => prev ? {
                ...prev,
                status: 'Completed',
                timer_status: 'stopped',
                actual_end_time: now,
                service_type: category
            } : null);
            setIsCompletionModalOpen(false);
            fetchJobItems(); // Refresh for labor item
            showToast('Success', `Job completed as ${category}!`, 'success');
        }
    };

    useEffect(() => {
        if (!job || !job.date_completed || job.status === 'Completed') {
            setTimeLeft('');
            return;
        }

        const updateTimer = () => {
            const now = new Date();
            const end = new Date(job.date_completed!);
            const diff = end.getTime() - now.getTime();

            const absoluteSeconds = Math.abs(Math.floor(diff / 1000));
            const h = Math.floor(absoluteSeconds / 3600);
            const m = Math.floor((absoluteSeconds % 3600) / 60);
            const s = absoluteSeconds % 60;
            const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            setTimeLeft(diff < 0 ? `-${timeStr}` : timeStr);
        };

        updateTimer();
        const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [job?.date_completed, job?.status]);

    useEffect(() => {
        if (id) {
            fetchJobDetails();
            fetchJobItems();
            fetchInventory();
            loadSettings();
            fetchEngineers();
            fetchLabourLogs();
        }
    }, [id]);

    const fetchEngineers = async () => {
        const data = await dataService.getEngineers();
        setEngineers(data);
    };

    const fetchLabourLogs = async () => {
        if (!id) return;
        const { data, error } = await supabase
            .from('labour_logs')
            .select('*')
            .eq('job_id', id)
            .order('created_at', { ascending: false });
        if (!error) setLabourLogs(data || []);
    };

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
            const mappedJob = {
                ...data,
                engineer_name: data.mechanic_id || data.engineer_name || '',
                notes: data.problem_description || data.notes || ''
            };
            setJob(mappedJob);
            setDiagnosisNotes(data.diagnosis_notes || '');
            setRepairSummary(data.repair_summary || '');
            setRecommendations(data.recommendations || '');
            setMechanicSignOff(data.mechanic_sign_off_name || '');
            
            // Fetch history
            if (data.customer_id) {
                const hist = await dataService.getJobHistory(data.customer_id, data.id);
                setHistory(hist);
            }
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
            const itemToInsert = {
                ...newItem,
                job_id: id,
                status: newItem.type === 'part' ? 'Park Mode' : undefined
            };

            const { data, error } = await dataService.addJobItem(itemToInsert);

            if (error) throw error;
            if (data) {
                setItems([...items, data]);
                setNewItem({ description: '', quantity: 1, unit_price: 0, type: 'part' });
                fetchInventory(); // Refresh inventory stock level
            }
        } catch (error: any) {
            showToast('Error', 'Error adding item: ' + error.message, 'error');
        }
    };

    const handleDeleteItem = async (itemId: string) => {
        const { error } = await supabase.from('job_items').delete().eq('id', itemId);
        if (!error) {
            setItems(items.filter(i => i.id !== itemId));
            fetchInventory(); // Refresh stock level
        }
    };

    const handleResolveItem = async (itemId: string, status: 'Used' | 'Returned') => {
        const { error } = await dataService.resolveParkedItem(itemId, status);
        if (!error) {
            setItems(items.map(i => i.id === itemId ? { ...i, status } : i));
            fetchInventory();
            showToast('Success', `Item marked as ${status}`, 'success');
        } else {
            showToast('Error', 'Failed to resolve item', 'error');
        }
    };


    const generateJobSheet = async () => {
        if (!job) return;
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
            const primaryColor: [number, number, number] = [10, 128, 67]; // DeLaval Green

            // Helper to add logo if exists
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
                        console.error('Logo load failed', e);
                        return false;
                    }
                }
                return false;
            };

            // --- Header Layout (Professional Invoice Style) ---
            doc.setFillColor(248, 250, 251); // Light slate background for header
            doc.rect(0, 0, 210, 45, 'F');

            const hasLogo = await addLogo(doc);

            // Branding
            if (!hasLogo) {
                doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                doc.setFontSize(24);
                doc.setFont('helvetica', 'bold');
                doc.text(s.company_name.toUpperCase(), 14, 25);
            }

            doc.setTextColor(100, 100, 100);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text(s.company_address || '', hasLogo ? 48 : 14, hasLogo ? 18 : 32);
            doc.text(`Tel: ${s.company_phone || ''} | Email: ${s.company_email || ''}`, hasLogo ? 48 : 14, hasLogo ? 23 : 37);

            // Document Info
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('JOB WORKSHEET', 196, 25, { align: 'right' });
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Tag Number: #${job.tag_number || 'N/A'}`, 196, 32, { align: 'right' });
            doc.text(`Date: ${new Date().toLocaleDateString()}`, 196, 37, { align: 'right' });

            // --- Customer Section ---
            doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setLineWidth(0.5);
            doc.line(14, 52, 28, 52); // Accent line

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('CUSTOMER INFORMATION', 14, 50);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text([
                `Name: ${job.customers?.name}`,
                `Address: ${job.customers?.address || 'N/A'}`,
                `Phone: ${job.customers?.phone || 'N/A'}`
            ], 14, 60);

            // --- Equipment Section ---
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('EQUIPMENT & PROBLEM DESCRIPTION', 14, 85);
            doc.line(14, 87, 28, 87);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Machine / System: ${job.machine_details || 'N/A'}`, 14, 95);

            const splitProblem = doc.splitTextToSize(job.problem_description || 'No description provided.', 180);
            doc.text('Fault Description:', 14, 105);
            doc.text(splitProblem, 14, 110);

            // --- Table Section ---
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('RESERVED PARTS & MATERIALS', 14, 140);

            autoTable(doc, {
                startY: 145,
                head: [['DESCRIPTION', 'QTY', 'STATUS']],
                body: items.filter(i => i.type === 'part').map(i => [
                    i.description,
                    i.quantity.toString(),
                    'RESERVED'
                ]),
                theme: 'striped',
                headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 4 },
                columnStyles: {
                    1: { halign: 'center' },
                    2: { halign: 'right', fontStyle: 'bold' }
                }
            });

            // --- Footer ---
            const pageHeight = doc.internal.pageSize.height;
            doc.setDrawColor(230, 230, 230);
            doc.line(14, pageHeight - 30, 196, pageHeight - 30);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text('Generated by MD Burke Workshop System', 14, pageHeight - 20);
            doc.text(`Ref: ${job.id}`, 196, pageHeight - 20, { align: 'right' });

            doc.save(`JobSheet_${job.tag_number || job.id.slice(0, 8)}.pdf`);
            showToast('Success', 'Job Sheet successfully generated!', 'success');
        } catch (error: any) {
            console.error('PDF Error:', error);
            showToast('Error', 'Error generating PDF: ' + error.message, 'error');
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
                company_email: 'service@mdburke.ie',
                company_logo_url: ''
            };

            const doc = new jsPDF();
            const primaryColor: [number, number, number] = [10, 128, 67]; // MD Burke Green
            const secondaryBg: [number, number, number] = [249, 250, 251]; // Soft Gray
            const borderColor: [number, number, number] = [229, 231, 235];
            const textColor: [number, number, number] = [31, 41, 55];
            const mutedText: [number, number, number] = [100, 116, 139];

            // Helper to add logo if exists
            const addLogo = async (doc: any) => {
                if (s.company_logo_url) {
                    try {
                        const img = new Image();
                        img.src = s.company_logo_url;
                        await new Promise((resolve, reject) => {
                            img.onload = resolve;
                            img.onerror = reject;
                        });
                        // Proportional scaling for logo
                        const maxWidth = 45;
                        const maxHeight = 25;
                        let width = img.width;
                        let height = img.height;
                        const ratio = Math.min(maxWidth / width, maxHeight / height);
                        width *= ratio;
                        height *= ratio;

                        doc.addImage(img, 'PNG', 14, 12, width, height);
                        return { width, height };
                    } catch (e) {
                        console.error('Logo load failed', e);
                        return null;
                    }
                }
                return null;
            };

            // --- Header Enhancement ---
            // Top Accent Bar
            doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.rect(0, 0, 210, 4, 'F');

            const logoInfo = await addLogo(doc);
            const headerTextX = logoInfo ? 14 + logoInfo.width + 10 : 14;

            // Company Info
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            doc.setFontSize(logoInfo ? 12 : 18);
            doc.setFont('helvetica', 'bold');
            doc.text(s.company_name.toUpperCase(), headerTextX, 18);

            doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text(s.company_address || '', headerTextX, 23);
            doc.text(`Tel: ${s.company_phone || ''} | Email: ${s.company_email || ''}`, headerTextX, 28);

            // Report Title & Meta
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.text('COMPLETION REPORT', 196, 22, { align: 'right' });

            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(`Tag Number: #${job.tag_number || 'N/A'}`, 196, 32, { align: 'right' });

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
            doc.text(`Completed: ${new Date().toLocaleDateString()}`, 196, 35, { align: 'right' });
            doc.text(`Engineer: ${job.engineer_name || 'N/A'}`, 196, 40, { align: 'right' });

            // Horizontal Divider
            doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
            doc.setLineWidth(0.1);
            doc.line(14, 48, 196, 48);

            // --- Structured Info Sections (Cards) ---
            const drawSectionHeader = (title: string, y: number) => {
                doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                doc.rect(14, y, 3, 6, 'F');
                doc.setTextColor(textColor[0], textColor[1], textColor[2]);
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text(title, 20, y + 4.5);
            };

            // Section 1: Customer & Machine
            drawSectionHeader('SERVICE DETAILS', 58);

            // Info Grid Box
            doc.setFillColor(secondaryBg[0], secondaryBg[1], secondaryBg[2]);
            doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
            doc.roundedRect(14, 66, 182, 34, 2, 2, 'FD');

            doc.setFontSize(9);
            // Column 1
            doc.setFont('helvetica', 'bold');
            doc.text('CUSTOMER:', 20, 75);
            doc.setFont('helvetica', 'normal');
            doc.text(job.customers?.name || 'N/A', 55, 75);

            doc.setFont('helvetica', 'bold');
            doc.text('WHOLE GOOD NO:', 20, 81);
            doc.setFont('helvetica', 'normal');
            doc.text(job.whole_good_number || 'N/A', 55, 81);

            doc.setFont('helvetica', 'bold');
            doc.text('PO/IO NUMBER:', 20, 87);
            doc.setFont('helvetica', 'normal');
            doc.text(job.po_number || 'N/A', 55, 87);

            // Column 2
            doc.setFont('helvetica', 'bold');
            doc.text('MACHINE:', 110, 75);
            doc.setFont('helvetica', 'normal');
            doc.text(job.machine_details || 'N/A', 140, 75);

            doc.setFont('helvetica', 'bold');
            doc.text('LABOUR TIME:', 110, 81);
            doc.setFont('helvetica', 'normal');
            doc.text(`${(job.total_hours_worked || 0).toFixed(2)} hours`, 140, 81);

            doc.setFont('helvetica', 'bold');
            doc.text('SERVICE TYPE:', 110, 87);
            doc.setFont('helvetica', 'normal');
            doc.text(job.service_type || 'General Service', 140, 87);

            // --- Work Details ---
            drawSectionHeader('WORK SUMMARY', 105);

            // Diagnosis Box
            doc.setFillColor(secondaryBg[0], secondaryBg[1], secondaryBg[2]);
            doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
            doc.roundedRect(14, 113, 88, 35, 1, 1, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.text('DIAGNOSIS:', 18, 120);
            doc.setFont('helvetica', 'normal');
            const diagLines = doc.splitTextToSize(diagnosisNotes || 'N/A', 80);
            doc.text(diagLines, 18, 126);

            // Repair Box
            doc.setFillColor(secondaryBg[0], secondaryBg[1], secondaryBg[2]);
            doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
            doc.roundedRect(108, 113, 88, 35, 1, 1, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.text('REPAIR SUMMARY:', 112, 120);
            doc.setFont('helvetica', 'normal');
            const repairLines = doc.splitTextToSize(repairSummary || 'N/A', 80);
            doc.text(repairLines, 112, 126);

            // --- Parts Table ---
            const tableY = 155;
            drawSectionHeader('PARTS & MATERIALS UTILIZED', tableY);

            autoTable(doc, {
                startY: tableY + 8,
                head: [['DESCRIPTION', 'QTY', 'STATUS', 'UNIT PRICE', 'SUBTOTAL']],
                body: items.filter(i => i.type === 'part').map(i => [
                    i.description,
                    i.quantity.toString(),
                    (i.status || 'Used').toUpperCase(),
                    `€${i.unit_price.toFixed(2)}`,
                    `€${(i.quantity * i.unit_price).toFixed(2)}`
                ]),
                theme: 'grid',
                headStyles: {
                    fillColor: primaryColor,
                    textColor: 255,
                    fontSize: 9,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                styles: { fontSize: 9, cellPadding: 3 },
                columnStyles: {
                    0: { cellWidth: 'auto' },
                    1: { halign: 'center', cellWidth: 15 },
                    2: { halign: 'center', cellWidth: 25 },
                    3: { halign: 'right', cellWidth: 30 },
                    4: { halign: 'right', cellWidth: 30, fontStyle: 'bold' }
                }
            });

            const finalTableY = (doc as any).lastAutoTable.finalY || tableY + 20;

            // --- Recommendations ---
            const recsY = finalTableY + 12;
            // Manual page check
            if (recsY > 250) doc.addPage();

            const currentRecsY = recsY > 250 ? 20 : recsY;
            drawSectionHeader('PROFESSIONAL RECOMMENDATIONS', currentRecsY);

            const recs = doc.splitTextToSize(recommendations || 'Vehicle system is performing within normal parameters. No immediate action required.', 170);
            const recsHeight = Math.max(15, recs.length * 5 + 8);

            doc.setFillColor(253, 254, 255);
            doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setLineWidth(0.2);
            doc.rect(14, currentRecsY + 8, 182, recsHeight);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            doc.text(recs, 20, currentRecsY + 15);

            // --- Sign-off ---
            const signOffY = currentRecsY + 8 + recsHeight + 15;

            doc.setFillColor(secondaryBg[0], secondaryBg[1], secondaryBg[2]);
            doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
            doc.setLineWidth(0.1);
            doc.roundedRect(14, signOffY, 182, 35, 2, 2, 'FD');

            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('CERTIFIED COMPLETION', 20, signOffY + 8);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
            doc.text(`Service Engineer: ${mechanicSignOff || job.engineer_name || 'System User'}`, 20, signOffY + 16);
            doc.text(`Digital Verification: ${new Date().toLocaleString()}`, 20, signOffY + 23);
            doc.text(`Report Status: Final & Verified`, 20, signOffY + 30);

            // Signature Line
            doc.setDrawColor(textColor[0], textColor[1], textColor[2]);
            doc.line(130, signOffY + 25, 185, signOffY + 25);
            doc.setFontSize(8);
            doc.text('Authorized Signature', 145, signOffY + 30);

            // Footer
            const pageHeight = doc.internal.pageSize.height;
            doc.setFontSize(8);
            doc.setTextColor(180, 180, 180);
            doc.text(`Ref: ${job.id} | Generated via MD Burke Workshop Management`, 105, pageHeight - 10, { align: 'center' });

            // Save locally
            doc.save(`CompletionReport_${job.tag_number || job.id.slice(0, 8)}.pdf`);
            showToast('Success', 'Completion Report successfully generated!', 'success');

            // Update database with report details (no PDF URL)
            await supabase.from('jobs').update({
                recommendations,
                mechanic_sign_off_name: mechanicSignOff
            }).eq('id', job.id);

        } catch (error: any) {
            console.error('PDF Error:', error);
            showToast('Error', 'Error generating Completion Report: ' + error.message, 'error');
        } finally {
            setIsGenerating(false);
        }
    };


    if (!job) return <div className="p-8">Loading...</div>;

    const partsItems = items.filter(i => i.type === 'part');
    const laborItems = items.filter(i => i.type === 'labor' || i.type === 'service');
    const totalPartsCost = partsItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const totalLaborCost = laborItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    return (
        <Fragment>
            {/* Desktop View */}
            <div className="hidden md:block space-y-6">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/jobs')} className="p-2 hover:bg-slate-100 rounded-full">
                        <ArrowLeft />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold font-display text-slate-900">Tag #{job.tag_number || 'N/A'}</h1>
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
                        <div className="section-card overflow-visible relative z-20">
                            <div className="flex border-b border-slate-100 px-6 overflow-x-auto whitespace-nowrap scrollbar-hide">
                                <button
                                    onClick={() => setActiveTab('items')}
                                    className={`py-4 text-sm font-bold border-b-2 transition-colors mr-8 ${activeTab === 'items' ? 'border-delaval-blue text-delaval-blue' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                >
                                    Service Items
                                </button>
                                <button
                                    onClick={() => setActiveTab('labor')}
                                    className={`py-4 text-sm font-bold border-b-2 transition-colors mr-8 ${activeTab === 'labor' ? 'border-delaval-blue text-delaval-blue' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                >
                                    Labour Logs
                                </button>
                                <button
                                    onClick={() => setActiveTab('history')}
                                    className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'history' ? 'border-delaval-blue text-delaval-blue' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                >
                                    Job History ({history.length})
                                </button>
                            </div>
                            {/* Tab Content */}
                            <div className="p-6">
                                {activeTab === 'items' && (
                                    <div className="space-y-6">
                                        <h2 className="text-lg font-bold">Service Items</h2>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead className="bg-slate-50">
                                                    <tr className="text-left text-xs font-bold text-slate-500 uppercase tracking-widest">
                                                        <th className="px-4 py-3">Description</th>
                                                        <th className="px-4 py-3">Qty</th>
                                                        <th className="px-4 py-3">Status</th>
                                                        <th className="px-4 py-3">Cost (€)</th>
                                                        <th className="px-4 py-3">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {items.map(item => (
                                                        <tr key={item.id} className="border-t border-slate-100">
                                                            <td className="px-4 py-3">
                                                                <div className="font-medium text-slate-900">{item.description}</div>
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-600">{item.quantity}</td>
                                                            <td className="px-4 py-3">
                                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${item.status === 'Park Mode' ? 'bg-orange-50 text-orange-600 border border-orange-100' :
                                                                    item.status === 'Used' ? 'bg-green-50 text-green-600 border border-green-100' :
                                                                        item.status === 'Returned' ? 'bg-slate-50 text-slate-500 border border-slate-100' :
                                                                            'bg-slate-50 text-slate-500'
                                                                    }`}>
                                                                    {item.status || (item.type === 'labor' ? 'Logged' : 'Used')}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 font-medium">€{item.unit_price}</td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex items-center gap-2">
                                                                    {item.status === 'Park Mode' && job.status !== 'Completed' && (
                                                                        <>
                                                                            <button
                                                                                onClick={() => handleResolveItem(item.id, 'Used')}
                                                                                className="px-2 py-1 bg-green-600 text-white text-[10px] font-bold rounded hover:bg-green-700 transition-colors uppercase"
                                                                            >
                                                                                Use
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleResolveItem(item.id, 'Returned')}
                                                                                className="px-2 py-1 bg-slate-200 text-slate-700 text-[10px] font-bold rounded hover:bg-slate-300 transition-colors uppercase"
                                                                            >
                                                                                Return
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                    {job.status !== 'Completed' && (
                                                                        <button
                                                                            onClick={() => handleDeleteItem(item.id)}
                                                                            className="text-slate-300 hover:text-red-500 p-1.5 rounded transition-colors"
                                                                        >
                                                                            <Trash2 size={16} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {job.status !== 'Completed' && (
                                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-5 relative overflow-visible z-10">
                                                {/* Unified Active Session Work Hub */}
                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm transition-all duration-300">
                                                    <div className="flex items-center gap-4">
                                                        {(() => {
                                                            const isOverdue = (job.status as string) !== 'Completed' && job.date_completed && new Date(job.date_completed) < new Date();
                                                            return (
                                                                <div className={`px-4 py-2.5 rounded-xl flex items-center gap-3 border transition-all duration-500 ${
                                                                    isOverdue ? 'bg-red-50 border-red-200 text-red-700' :
                                                                    job.date_completed ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                                                    'bg-slate-50 border-slate-200 text-slate-700'
                                                                }`}>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60 leading-tight">
                                                                            {timerStatus === 'running' ? 'ACTIVE SESSION' : 'SESSION TIMER'}
                                                                        </span>
                                                                         <div className="text-[10px] font-bold text-slate-400 mt-1">
                                                                             TOTAL: {formatTime(Math.round((job?.total_hours_worked || 0) * 3600))}
                                                                         </div>

                                                                        <div className="text-xl font-black font-mono flex items-center gap-2 leading-tight">
                                                                            <Clock size={16} className={timerStatus === 'running' ? 'animate-pulse text-delaval-blue' : 'text-slate-400'} />
                                                                            {formatTime(timerStatus === 'running' ? elapsedSeconds : 0)}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}

                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-tight">MECHANIC</span>
                                                            <div className="flex items-center gap-2 text-sm font-bold text-slate-700 mt-0.5">
                                                                <UserCheck size={14} className="text-delaval-blue" />
                                                                {job.engineer_name || 'Unassigned'}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2 w-full sm:w-auto">
                                                        {timerStatus !== 'running' ? (
                                                            <button
                                                                onClick={handleStartTimer}
                                                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-delaval-blue text-white px-5 py-2.5 rounded-lg text-sm font-black hover:bg-delaval-dark-blue transition-all shadow-md active:scale-95"
                                                            >
                                                                <Play size={16} fill="currentColor" /> START
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={handlePauseTimer}
                                                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-amber-500 text-white px-5 py-2.5 rounded-lg text-sm font-black hover:bg-amber-600 transition-all shadow-md active:scale-95"
                                                            >
                                                                <Pause size={16} fill="currentColor" /> PAUSE
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={handleStopTimer}
                                                            disabled={timerStatus === 'stopped'}
                                                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-black transition-all shadow-sm ${
                                                                timerStatus === 'stopped' 
                                                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200 shadow-none' 
                                                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95'
                                                            }`}
                                                        >
                                                            <StopCircle size={16} /> STOP
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="flex gap-4 border-t border-slate-100 pt-4">
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
                                )}

                                {activeTab === 'history' && (
                                    <div className="space-y-4">
                                        <h2 className="text-lg font-bold">Job History</h2>
                                        {history.length === 0 ? (
                                            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                                <Clock size={48} className="mx-auto text-slate-300 mb-4" />
                                                <p className="text-slate-500 font-medium">No previous service history for this customer.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {history.map(h => (
                                                    <div 
                                                        key={h.id} 
                                                        className="p-4 bg-white border border-slate-100 rounded-xl hover:border-delaval-blue transition-all cursor-pointer group shadow-sm hover:shadow-md"
                                                        onClick={() => navigate(`/jobs/${h.id}`)}
                                                    >
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs">
                                                                    #{h.tag_number || 'N/A'}
                                                                </div>
                                                                <span className="font-bold text-slate-900">{new Date(h.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                            </div>
                                                            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                                                                h.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                                                            }`}>
                                                                {h.status}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-slate-600 line-clamp-2">{h.notes || 'No description provided.'}</p>
                                                        <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                                                            <span>Engineer: {h.engineer_name || 'Unassigned'}</span>
                                                            <span className="text-delaval-blue group-hover:underline">View Details →</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'labor' && (
                                    <div className="space-y-6">
                                        <h2 className="text-lg font-bold">Labour Logs</h2>
                                        <div className="space-y-4">
                                            {labourLogs.length === 0 ? (
                                                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                                    <Clock size={48} className="mx-auto text-slate-300 mb-4" />
                                                    <p className="text-slate-500 font-medium">No labour has been logged for this job yet.</p>
                                                </div>
                                            ) : (
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left">
                                                        <thead className="bg-slate-50">
                                                            <tr className="text-left text-xs font-bold text-slate-500 uppercase tracking-widest">
                                                                <th className="px-4 py-3">Mechanic</th>
                                                                <th className="px-4 py-3">Start Time</th>
                                                                <th className="px-4 py-3">End Time</th>
                                                                <th className="px-4 py-3 text-right">Duration</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {labourLogs.map(log => (
                                                                <tr key={log.id} className="border-t border-slate-100">
                                                                    <td className="px-4 py-3 font-medium text-slate-900">{log.mechanic_id}</td>
                                                                    <td className="px-4 py-3 text-slate-600 text-sm">{new Date(log.start_time).toLocaleString()}</td>
                                                                    <td className="px-4 py-3 text-slate-600 text-sm">{log.end_time ? new Date(log.end_time).toLocaleString() : 'Running...'}</td>
                                                                    <td className="px-4 py-3 text-right font-bold text-delaval-blue">{log.duration_minutes}m</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="section-card p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-bold text-slate-900">Job Control</h2>
                            </div>
                            <div className="space-y-4">
                                {/* Job Controls - Priority & Completion */}
                                {job.status !== 'Completed' && (
                                    <div className="bg-white p-5 rounded-2xl border border-slate-100 space-y-5 shadow-sm">
                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Pipeline Priority</label>
                                            <div className="flex bg-slate-50 p-1.5 rounded-xl border border-slate-100 shadow-inner">
                                                {[
                                                    { value: 'Normal', label: 'Normal', color: 'text-slate-600', active: 'bg-white text-slate-900' },
                                                    { value: 'Urgent', label: 'Urgent', color: 'text-red-600', active: 'bg-red-600 text-white' },
                                                    { value: 'Overdue', label: 'Overdue', color: 'text-orange-600', active: 'bg-orange-600 text-white' }
                                                ].map((p) => (
                                                    <button
                                                        key={p.value}
                                                        onClick={async () => {
                                                            const priorityValue = p.value as 'Normal' | 'Urgent' | 'Overdue';
                                                            const { error } = await supabase.from('jobs').update({ priority: priorityValue }).eq('id', job.id);
                                                            if (!error) setJob({ ...job, priority: priorityValue });
                                                        }}
                                                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-xs font-bold transition-all duration-200 ${job.priority === p.value ? `${p.active} shadow-md scale-[1.02]` : `${p.color} hover:bg-white/50 active:scale-95`}`}
                                                    >
                                                        {p.value === 'Urgent' && <AlertCircle size={14} />}
                                                        {p.value === 'Overdue' && <AlertTriangle size={14} />}
                                                        {p.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleCompleteJob()}
                                            className="w-full flex justify-center items-center gap-3 bg-[#0A8043] text-white hover:bg-[#065F30] py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all shadow-lg active:scale-95 group overflow-hidden relative"
                                        >
                                            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                            <CheckCircle size={20} className="relative group-hover:scale-110 transition-transform" />
                                            <span className="relative">Mark Job as Completed</span>
                                        </button>
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
                                    <label className="block text-sm font-medium text-slate-500 mb-2">Pipeline</label>
                                    {job.status === 'Completed' ? (
                                        <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-2.5 rounded-lg border border-green-200 font-medium w-full">
                                            <CheckCircle size={18} /> Completed
                                        </div>
                                    ) : (
                                        <Fragment>
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
                                            <div className="space-y-4 pt-4 border-t border-slate-100 mt-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-500 mb-1">Whole Good Number</label>
                                                        <input
                                                            type="text"
                                                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-delaval-blue transition-all"
                                                            placeholder="Permanent Machine ID..."
                                                            value={job.whole_good_number || ''}
                                                            onChange={(e) => setJob({ ...job, whole_good_number: e.target.value })}
                                                            onBlur={async () => {
                                                                await supabase.from('jobs').update({ whole_good_number: job.whole_good_number }).eq('id', job.id);
                                                            }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-500 mb-1">PO / IO Number</label>
                                                        <input
                                                            type="text"
                                                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-delaval-blue transition-all"
                                                            placeholder="Purchase Order Reference..."
                                                            value={job.po_number || ''}
                                                            onChange={(e) => setJob({ ...job, po_number: e.target.value })}
                                                            onBlur={async () => {
                                                                await supabase.from('jobs').update({ po_number: job.po_number }).eq('id', job.id);
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-500 mb-2">Engineer</label>
                                                    <SearchableSelect
                                                        label=""
                                                        options={engineers.map(e => ({ value: e.name, label: e.name }))}
                                                        value={job.engineer_name || ''}
                                                        onChange={async (val) => {
                                                            const { error } = await supabase.from('jobs').update({ mechanic_id: val }).eq('id', job.id);
                                                            if (!error) {
                                                                setJob({ ...job, engineer_name: val });
                                                                showToast('Updated', `Mechanic changed to ${val}`, 'success');
                                                            }
                                                        }}
                                                        placeholder="Select Mechanic..."
                                                        icon={<UserCheck size={16} />}
                                                    />
                                                </div>
                                                <div className="text-[11px] text-slate-400 italic bg-amber-50 p-2 rounded border border-amber-100 flex items-center gap-2">
                                                    <AlertCircle size={12} className="text-amber-500" />
                                                    Note: Changing mechanic will log future time sessions to the new mechanic.
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-500">Scheduled Date</label>
                                                    <div className="text-slate-900">{job.date_scheduled ? new Date(job.date_scheduled).toLocaleDateString() : 'Unscheduled'}</div>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-500">Job Description</label>
                                                    <div className="text-slate-900 bg-white border border-slate-200 p-3 rounded-lg mt-1 text-sm shadow-inner">{job.notes || 'No description provided.'}</div>
                                                </div>
                                            </div>
                                        </Fragment>
                                    )}
                                </div>

                                {/* PDF Links */}
                                    {(job.job_sheet_pdf_url || job.completion_report_pdf_url) && (
                                        <div className="pt-4 border-t border-slate-100 space-y-2">
                                            <div className="text-[11px] font-bold text-slate-400 tracking-wider">TAG #{job.tag_number || 'N/A'}</div>
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
            </div>

            {/* Mobile View */}
            <div className="block md:hidden pb-24 bg-[#F8FAFB] min-h-screen text-[#1a1a1a]">
                {/* Mobile Header */}
                <div className="bg-white px-4 py-4 flex items-center justify-between sticky top-0 z-20 border-b border-slate-100">
                    <button onClick={() => navigate('/jobs')} className="p-2 -ml-2 text-slate-600 hover:bg-slate-50 rounded-full">
                        <ArrowLeft size={24} />
                    </button>
                    <div className="flex-1 text-center truncate px-2">
                        <h1 className="text-lg font-bold font-display text-slate-900 truncate">
                            {job.customers?.name || `Tag #${job.tag_number || 'N/A'}`}
                        </h1>
                        {(() => {
                            const isOverdue = job.status !== 'Completed' && job.date_completed && new Date(job.date_completed!) < new Date();
                            if (isOverdue) return <span className="text-[10px] font-black text-red-600 uppercase tracking-tighter">OVERDUE</span>;
                            if (job.date_completed && job.status !== 'Completed') return <span className="text-[10px] font-bold text-amber-600 uppercase tracking-tighter">Ends in {timeLeft}</span>;
                            return <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Job Details</span>;
                        })()}
                    </div>
                    <div className="w-10"></div>
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

                    {/* Mobile Pipeline & Priority */}
                    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 pl-1">Pipeline Stage</label>
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

                        {job.status !== 'Completed' && (
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 pl-1">Pipeline Priority</label>
                                <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100 shadow-inner">
                                    {[
                                        { value: 'Normal', label: 'Normal', active: 'bg-white text-slate-900 shadow-sm' },
                                        { value: 'Urgent', label: 'Urgent', active: 'bg-red-600 text-white shadow-sm' },
                                        { value: 'Overdue', label: 'Overdue', active: 'bg-orange-600 text-white shadow-sm' }
                                    ].map((p) => (
                                        <button
                                            key={p.value}
                                            onClick={async () => {
                                                const val = p.value as 'Normal' | 'Urgent' | 'Overdue';
                                                const { error } = await supabase.from('jobs').update({ priority: val }).eq('id', job.id);
                                                if (!error) setJob({ ...job, priority: val });
                                            }}
                                            className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all duration-200 ${job.priority === p.value ? p.active : 'text-slate-500'}`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                     {/* Mobile Machine & Order Info */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Machine & Order Tracking</h3>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Whole Good Number</label>
                                <input 
                                    type="text"
                                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-delaval-blue/20"
                                    placeholder="Permanent Machine ID..."
                                    value={job.whole_good_number || ''}
                                    onChange={(e) => setJob({...job, whole_good_number: e.target.value})}
                                    onBlur={async () => {
                                        await supabase.from('jobs').update({ whole_good_number: job.whole_good_number }).eq('id', job.id);
                                        showToast('Saved', 'Machine ID updated', 'success');
                                    }}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">PO / IO Number</label>
                                <input 
                                    type="text"
                                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-delaval-blue/20"
                                    placeholder="Purchase Order Reference..."
                                    value={job.po_number || ''}
                                    onChange={(e) => setJob({...job, po_number: e.target.value})}
                                    onBlur={async () => {
                                        await supabase.from('jobs').update({ po_number: job.po_number }).eq('id', job.id);
                                        showToast('Saved', 'PO Number updated', 'success');
                                    }}
                                />
                            </div>
                        </div>
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
                        <button
                            className={`flex-1 pb-3 text-sm font-bold text-center border-b-2 transition-colors ${mobileTab === 'history' ? 'border-delaval-blue text-delaval-blue' : 'border-transparent text-slate-500'}`}
                            onClick={() => setMobileTab('history')}
                        >
                            HISTORY
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
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Diagnosis Notes</h3>
                                    <textarea
                                        rows={3}
                                        className="w-full p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm outline-none focus:ring-2 focus:ring-delaval-blue/20"
                                        placeholder="What did you find?..."
                                        value={diagnosisNotes}
                                        onChange={e => setDiagnosisNotes(e.target.value)}
                                        onBlur={async () => {
                                            await supabase.from('jobs').update({ diagnosis_notes: diagnosisNotes }).eq('id', job.id);
                                            showToast('Success', 'Diagnosis notes saved', 'success');
                                        }}
                                    />
                                </div>
                                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Repair Summary</h3>
                                    <textarea
                                        rows={3}
                                        className="w-full p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm outline-none focus:ring-2 focus:ring-delaval-blue/20"
                                        placeholder="What did you fix?..."
                                        value={repairSummary}
                                        onChange={e => setRepairSummary(e.target.value)}
                                        onBlur={async () => {
                                            await supabase.from('jobs').update({ repair_summary: repairSummary }).eq('id', job.id);
                                            showToast('Success', 'Repair summary saved', 'success');
                                        }}
                                    />
                                </div>

                                {/* Actions */}
                                {job.status !== 'Completed' && job.status !== 'Closed' && (
                                    <div className="mt-6 space-y-3">
                                        {/* Unified Mobile Time Tracking */}
                                        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">
                                                        {timerStatus === 'running' ? 'ACTIVE SESSION' : 'SESSION TIMER'}
                                                     <div className="text-[10px] font-bold text-slate-500 mt-1">
                                                         Total: {formatTime(Math.round((job?.total_hours_worked || 0) * 3600))}
                                                     </div>

                                                    </span>
                                                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700 mt-1">
                                                        <UserCheck size={14} className="text-delaval-blue" />
                                                        {job.engineer_name || 'Unassigned'}
                                                    </div>
                                                </div>
                                                <div className={`px-3 py-1.5 rounded-lg font-mono font-black text-lg ${timerStatus === 'running' ? 'bg-delaval-blue/5 text-delaval-blue animate-pulse' : 'bg-slate-50 text-slate-400'}`}>
                                                    {formatTime(timerStatus === 'running' ? elapsedSeconds : 0)}
                                                </div>
                                            </div>

                                            <div className="flex gap-3 pt-1">
                                                {timerStatus !== 'running' ? (
                                                    <button
                                                        onClick={handleStartTimer}
                                                        className="flex-1 flex items-center justify-center gap-2 bg-delaval-blue text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-md active:scale-95"
                                                    >
                                                        <Play size={16} fill="currentColor" /> START
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={handlePauseTimer}
                                                        className="flex-1 flex items-center justify-center gap-2 bg-amber-500 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-md active:scale-95"
                                                    >
                                                        <Pause size={16} fill="currentColor" /> PAUSE
                                                    </button>
                                                )}
                                                <button
                                                    onClick={handleStopTimer}
                                                    disabled={timerStatus === 'stopped'}
                                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                                                        timerStatus === 'stopped'
                                                        ? 'bg-slate-50 text-slate-300 cursor-not-allowed border border-slate-100 shadow-none'
                                                        : 'bg-white border border-slate-200 text-slate-700 shadow-sm active:scale-95'
                                                    }`}
                                                >
                                                    <StopCircle size={16} /> STOP
                                                </button>
                                            </div>
                                        </div>

                                        <button
                                            onClick={generateJobSheet}
                                            disabled={isGenerating}
                                            className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 py-3 rounded-xl font-bold text-sm shadow-sm transition-colors"
                                        >
                                            <Printer size={18} /> {isGenerating ? 'Generating...' : 'Job Sheet (PDF)'}
                                        </button>

                                        <button
                                            onClick={() => handleCompleteJob()}
                                            className="w-full flex items-center justify-center gap-3 bg-[#0A8043] text-white py-4 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-[#0A8043]/20 active:scale-95 transition-all"
                                        >
                                            <CheckCircle size={18} /> MARK AS COMPLETED
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
                                            <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 group">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <div className="font-bold text-slate-900 text-sm">{item.description}</div>
                                                        <div className="text-sm text-slate-500 mt-0.5">Qty {item.quantity} × €{item.unit_price} | <span className={`uppercase font-bold text-[10px] ${item.status === 'Park Mode' ? 'text-orange-500' : item.status === 'Used' ? 'text-green-600' : 'text-slate-400'}`}>{item.status || 'Used'}</span></div>
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
                                                {item.status === 'Park Mode' && job.status !== 'Completed' && (
                                                    <div className="flex gap-2 mt-4">
                                                        <button
                                                            onClick={() => handleResolveItem(item.id, 'Used')}
                                                            className="flex-1 py-2 bg-green-50 text-green-700 text-[10px] font-bold rounded-lg border border-green-200 uppercase tracking-wider"
                                                        >
                                                            Mark Used
                                                        </button>
                                                        <button
                                                            onClick={() => handleResolveItem(item.id, 'Returned')}
                                                            className="flex-1 py-2 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-200 uppercase tracking-wider"
                                                        >
                                                            Return to Stock
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {mobileTab === 'labor' && (
                            <div className="space-y-6">
                                {/* Add Labor Form */}
                                {job.status !== 'Completed' && (
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-3">
                                        <h3 className="text-sm font-bold text-slate-900">Add Time/Labour (Billable)</h3>
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

                                {/* Labor Items (Billable) */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center px-1">
                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Billable Labour ({laborItems.length})</span>
                                        <span className="text-sm font-bold text-slate-900">Total: €{totalLaborCost.toFixed(2)}</span>
                                    </div>
                                    {laborItems.length === 0 ? (
                                        <p className="text-sm text-slate-500 text-center py-4 bg-white rounded-xl border border-slate-100">No billable time added yet.</p>
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

                                {/* Timer Work History (Logs) */}
                                <div className="space-y-3 pt-4 border-t border-slate-100">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Work History (Logs)</h3>
                                    {labourLogs.length === 0 ? (
                                        <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                            <p className="text-xs text-slate-400 font-medium">No sessions recorded yet.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {labourLogs.map(log => (
                                                <div key={log.id} className="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-[10px] font-black text-delaval-blue uppercase">{log.mechanic_id}</span>
                                                        <span className="text-[10px] font-mono font-bold text-slate-500">{new Date(log.start_time).toLocaleDateString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-slate-600">
                                                            {new Date(log.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
                                                            {log.end_time ? new Date(log.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Running...'}
                                                        </span>
                                                        <span className="text-xs font-black text-slate-900">{log.duration_minutes} min</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {mobileTab === 'history' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center px-1 mb-2">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Previous Jobs ({history.length})</span>
                                </div>
                                {history.length === 0 ? (
                                    <p className="text-sm text-slate-500 text-center py-8 bg-white rounded-xl border border-slate-100">No previous history found.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {history.map(h => (
                                            <div 
                                                key={h.id} 
                                                className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 active:scale-[0.98] transition-all"
                                                onClick={() => navigate(`/jobs/${h.id}`)}
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-delaval-blue bg-delaval-blue/10 px-2 py-0.5 rounded">Tag #{h.tag_number || 'N/A'}</span>
                                                        <span className="text-sm font-bold text-slate-900">{new Date(h.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${h.status === 'Completed' ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-500'}`}>
                                                        {h.status}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 line-clamp-2 mb-3">{h.notes || 'No notes available'}</p>
                                                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                    <span>{h.engineer_name || 'Unassigned'}</span>
                                                    <span className="text-delaval-blue">Details →</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Completion Category Modal */}
            {isCompletionModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8">
                            <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Service Completion</h3>
                            <p className="text-slate-500 font-medium mb-8">Please select a standardized category to finalize this job record.</p>

                            <div className="grid gap-3">
                                {[
                                    { id: 'Minor Service', icon: <Settings size={20} />, color: 'bg-blue-50 text-blue-600' },
                                    { id: 'Full Service', icon: <Wrench size={20} />, color: 'bg-emerald-50 text-emerald-600' },
                                    { id: 'General Repair', icon: <Package size={20} />, color: 'bg-orange-50 text-orange-600' },
                                    { id: 'Other', icon: <CheckCircle size={20} />, color: 'bg-slate-50 text-slate-600' }
                                ].map((cat) => (
                                    <button
                                        key={cat.id}
                                        onClick={() => handleCompleteJob(cat.id)}
                                        className="flex items-center gap-4 p-5 rounded-2xl border border-slate-100 hover:border-delaval-blue/30 hover:bg-slate-50 transition-all group text-left"
                                    >
                                        <div className={`p-3 rounded-xl ${cat.color} group-hover:scale-110 transition-transform`}>
                                            {cat.icon}
                                        </div>
                                        <span className="font-black text-slate-800 tracking-tight">{cat.id}</span>
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => setIsCompletionModalOpen(false)}
                                className="w-full mt-8 py-4 text-sm font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Fragment>
    );
};

export default JobDetails;
