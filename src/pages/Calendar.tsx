import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Wrench, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { dataService } from '../services/dataService';
import { Job, Customer } from '../types';
import Modal from '../components/Modal';
import DatePicker from '../components/DatePicker';
import { useAuth } from '../context/AuthContext';

const CalendarPage = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [jobs, setJobs] = useState<Job[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [engineers, setEngineers] = useState<any[]>([]);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [mobileView, setMobileView] = useState<'list' | 'calendar'>('list');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newJob, setNewJob] = useState({
        customer_id: '',
        engineer_name: '',
        service_type: '',
        status: 'Booked In' as const,
        date_scheduled: new Date().toISOString().split('T')[0],
        notes: ''
    });

    const { user } = useAuth();

    useEffect(() => {
        const load = async () => {
            const userRole = user?.user_metadata?.role;
            const engineerName = userRole === 'Engineer' ? (user?.user_metadata?.name || user?.email?.split('@')[0]) : undefined;

            const [jobsData, custData, engData] = await Promise.all([
                dataService.getJobs(undefined, engineerName),
                dataService.getCustomers(),
                dataService.getEngineers()
            ]);
            setJobs(jobsData);
            setCustomers(custData);
            setEngineers(engData);
        };
        load();
    }, []);

    const handleCreateJob = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const { error } = await dataService.createJob(newJob);
            if (error) throw error;

            const userRole = user?.user_metadata?.role;
            const engineerName = userRole === 'Engineer' ? (user?.user_metadata?.name || user?.email?.split('@')[0]) : undefined;
            const data = await dataService.getJobs(undefined, engineerName);
            setJobs(data);
            setIsCreateModalOpen(false);
            setNewJob({
                customer_id: '',
                engineer_name: '',
                service_type: '',
                status: 'Booked In',
                date_scheduled: new Date().toISOString().split('T')[0],
                notes: ''
            });
        } catch (error) {
            console.error('Error creating job:', error);
            alert('Failed to create job.');
        }
    };

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay();

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayNamesMobile = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const goToday = () => { setCurrentDate(new Date()); setSelectedDate(new Date().toISOString().split('T')[0]); };

    const getJobsForDate = (day: number) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return jobs.filter(j => j.date_scheduled?.startsWith(dateStr));
    };

    const statusConfig: Record<string, { dot: string; bg: string; text: string; label: string }> = {
        'Booked In': { dot: 'bg-blue-500', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', label: 'Booked In' },
        'In Progress': { dot: 'bg-amber-500', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'In Progress' },
        'Waiting for Parts': { dot: 'bg-yellow-500', bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', label: 'Waiting for Parts' },
        'Ready to Continue': { dot: 'bg-purple-500', bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700', label: 'Ready to Continue' },
        'Ready for Collection': { dot: 'bg-emerald-500', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Ready for Collection' },
        'Completed': { dot: 'bg-green-600', bg: 'bg-green-50 border-green-200', text: 'text-green-700', label: 'Completed' },
        'Closed': { dot: 'bg-slate-400', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-500', label: 'Closed' }
    };

    const todayStr = new Date().toISOString().split('T')[0];

    const selectedDateJobs = useMemo(() => {
        if (!selectedDate) return [];
        return jobs.filter(j => j.date_scheduled?.startsWith(selectedDate));
    }, [selectedDate, jobs]);

    // Upcoming scheduled/in-progress jobs (for mobile list view)
    const upcomingJobs = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        return jobs
            .filter(j => j.date_scheduled && j.date_scheduled >= today && j.status !== 'Closed' && j.status !== 'Completed')
            .sort((a, b) => (a.date_scheduled || '').localeCompare(b.date_scheduled || ''));
    }, [jobs]);

    // Today's jobs
    const todayJobs = useMemo(() => {
        return jobs.filter(j => j.date_scheduled?.startsWith(todayStr) && j.status !== 'Closed');
    }, [jobs, todayStr]);

    // Build calendar grid
    const calendarDays: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) calendarDays.push(null);
    for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

    const formatDateLabel = (dateStr: string) => {
        if (dateStr === todayStr) return 'Today';
        const d = new Date(dateStr + 'T00:00:00');
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (dateStr === tomorrow.toISOString().split('T')[0]) return 'Tomorrow';
        return d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
    };

    return (
        <div className="space-y-4 md:space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold font-display text-slate-900">Calendar</h1>
                    <p className="text-sm text-slate-500">Scheduled jobs and service appointments</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Mobile view toggle */}
                    <div className="md:hidden bg-white rounded-lg border border-slate-200 p-0.5 flex">
                        <button
                            onClick={() => setMobileView('list')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${mobileView === 'list' ? 'bg-delaval-blue text-white shadow-sm' : 'text-slate-500'}`}
                        >
                            Jobs
                        </button>
                        <button
                            onClick={() => setMobileView('calendar')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${mobileView === 'calendar' ? 'bg-delaval-blue text-white shadow-sm' : 'text-slate-500'}`}
                        >
                            Calendar
                        </button>
                    </div>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="ml-auto sm:ml-0 flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-delaval-blue to-[#124CA8] text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-900/20 hover:-translate-y-0.5 transition-all"
                    >
                        <Plus size={18} /> New Job
                    </button>
                </div>
            </div>

            {/* ===== MOBILE: Job List View ===== */}
            <div className={`md:hidden ${mobileView === 'list' ? 'block' : 'hidden'}`}>
                {/* Today Section */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-delaval-blue animate-pulse" />
                        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Today</h2>
                        <span className="text-xs text-slate-400">{new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                    </div>
                    {todayJobs.length > 0 ? (
                        <div className="space-y-2">
                            {todayJobs.map(job => (
                                <Link to={`/jobs/${job.id}`} key={job.id} className="block">
                                    <div className={`p-4 rounded-xl border ${statusConfig[job.status]?.bg || 'bg-white border-slate-200'} transition-all active:scale-[0.98]`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-bold text-slate-900 text-sm">#{job.job_number}</span>
                                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusConfig[job.status]?.dot} text-white`}>
                                                {statusConfig[job.status]?.label}
                                            </span>
                                        </div>
                                        <div className="text-sm font-semibold text-slate-800 mb-1">{job.customers?.name || 'Unknown'}</div>
                                        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                                            {job.service_type && <span className="flex items-center gap-1"><Wrench size={12} />{job.service_type}</span>}
                                            {job.engineer_name && <span className="flex items-center gap-1"><User size={12} />{job.engineer_name}</span>}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 bg-white rounded-xl border border-slate-100">
                            <CalendarDays size={32} className="mx-auto text-slate-300 mb-2" />
                            <p className="text-sm text-slate-400 font-medium">No jobs scheduled for today</p>
                        </div>
                    )}
                </div>

                {/* Upcoming Section */}
                <div>
                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">Upcoming Jobs</h2>
                    {upcomingJobs.length > 0 ? (
                        <div className="space-y-2">
                            {upcomingJobs.map(job => (
                                <Link to={`/jobs/${job.id}`} key={job.id} className="block">
                                    <div className="p-4 bg-white rounded-xl border border-slate-100 hover:border-delaval-blue/30 transition-all active:scale-[0.98]">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${statusConfig[job.status]?.dot}`} />
                                                <span className="font-bold text-sm text-slate-900">#{job.job_number}</span>
                                            </div>
                                            <span className="text-xs font-semibold text-delaval-blue bg-blue-50 px-2 py-0.5 rounded-full">
                                                {job.date_scheduled ? formatDateLabel(job.date_scheduled) : 'No date'}
                                            </span>
                                        </div>
                                        <div className="text-sm font-medium text-slate-700">{job.customers?.name || 'Unknown'}</div>
                                        <div className="flex gap-3 mt-1 text-xs text-slate-400">
                                            {job.service_type && <span className="flex items-center gap-1"><Wrench size={11} />{job.service_type}</span>}
                                            {job.engineer_name && <span className="flex items-center gap-1"><User size={11} />{job.engineer_name}</span>}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-6 bg-white rounded-xl border border-slate-100">
                            <p className="text-sm text-slate-400 italic">No upcoming jobs.</p>
                            <Link to="/jobs" className="text-sm text-delaval-blue font-semibold mt-2 inline-block hover:underline">
                                View all jobs →
                            </Link>
                        </div>
                    )}
                </div>
            </div>

            {/* ===== MOBILE: Mini Calendar View ===== */}
            <div className={`md:hidden ${mobileView === 'calendar' ? 'block' : 'hidden'}`}>
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                    {/* Month nav */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#124CA8] to-delaval-blue">
                        <button onClick={prevMonth} className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10">
                            <ChevronLeft size={20} />
                        </button>
                        <div className="text-center">
                            <h2 className="text-white font-bold text-base">{monthNames[month]} {year}</h2>
                        </div>
                        <button onClick={nextMonth} className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10">
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    {/* Day headers */}
                    <div className="grid grid-cols-7 border-b border-slate-100">
                        {dayNamesMobile.map((d, i) => (
                            <div key={i} className="py-2 text-center text-[11px] font-bold text-slate-400">{d}</div>
                        ))}
                    </div>

                    {/* Days grid (compact) */}
                    <div className="grid grid-cols-7 p-1">
                        {calendarDays.map((day, i) => {
                            if (day === null) return <div key={`e-${i}`} className="aspect-square" />;
                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const dayJobs = getJobsForDate(day);
                            const isToday = dateStr === todayStr;
                            const isSelected = dateStr === selectedDate;

                            return (
                                <button
                                    key={day}
                                    onClick={() => setSelectedDate(dateStr)}
                                    className={`aspect-square flex flex-col items-center justify-center rounded-xl text-sm relative transition-all
                                        ${isToday && !isSelected ? 'bg-blue-50 font-bold text-delaval-blue' : ''}
                                        ${isSelected ? 'bg-delaval-blue text-white shadow-md shadow-blue-900/20 scale-105' : ''}
                                        ${!isToday && !isSelected ? 'text-slate-700 hover:bg-slate-50 active:bg-slate-100' : ''}
                                    `}
                                >
                                    <span className="text-[13px]">{day}</span>
                                    {dayJobs.length > 0 && (
                                        <div className="flex gap-0.5 mt-0.5">
                                            {dayJobs.slice(0, 3).map((j, idx) => (
                                                <div key={idx} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : statusConfig[j.status]?.dot}`} />
                                            ))}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Selected date detail */}
                    {selectedDate && (
                        <div className="border-t border-slate-100 px-4 py-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </h3>
                            {selectedDateJobs.length > 0 ? (
                                <div className="space-y-2">
                                    {selectedDateJobs.map(job => (
                                        <Link to={`/jobs/${job.id}`} key={job.id} className="block">
                                            <div className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 active:bg-slate-100 transition-colors">
                                                <div className={`w-2.5 h-8 rounded-full ${statusConfig[job.status]?.dot}`} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-semibold text-slate-900 truncate">{job.customers?.name || 'Unknown'}</div>
                                                    <div className="text-xs text-slate-500">{job.service_type} • {job.engineer_name || 'Unassigned'}</div>
                                                </div>
                                                <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400 text-center py-3">No jobs this day</p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ===== DESKTOP: Full Calendar Grid ===== */}
            <div className="hidden md:grid lg:grid-cols-[1fr_340px] gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#124CA8] to-delaval-blue">
                        <div className="flex items-center gap-3">
                            <button onClick={prevMonth} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/80 hover:text-white">
                                <ChevronLeft size={20} />
                            </button>
                            <h2 className="text-lg font-bold text-white min-w-[200px] text-center">
                                {monthNames[month]} {year}
                            </h2>
                            <button onClick={nextMonth} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/80 hover:text-white">
                                <ChevronRight size={20} />
                            </button>
                        </div>
                        <button onClick={goToday} className="px-4 py-2 text-sm font-semibold text-white bg-white/15 rounded-lg hover:bg-white/25 transition-colors border border-white/20">
                            Today
                        </button>
                    </div>

                    {/* Day Names */}
                    <div className="grid grid-cols-7 bg-slate-50">
                        {dayNames.map(day => (
                            <div key={day} className="py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Cells */}
                    <div className="grid grid-cols-7">
                        {calendarDays.map((day, i) => {
                            if (day === null) return <div key={`empty-${i}`} className="min-h-[110px] bg-slate-50/30 border-b border-r border-slate-100" />;

                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const dayJobs = getJobsForDate(day);
                            const isToday = dateStr === todayStr;
                            const isSelected = dateStr === selectedDate;

                            return (
                                <div
                                    key={day}
                                    onClick={() => setSelectedDate(dateStr)}
                                    className={`min-h-[110px] p-2 border-b border-r border-slate-100 cursor-pointer transition-all
                                        ${isToday ? 'bg-blue-50/50' : 'hover:bg-slate-50/80'}
                                        ${isSelected ? 'ring-2 ring-delaval-blue ring-inset bg-blue-50/40' : ''}
                                    `}
                                >
                                    <div className={`text-sm font-bold mb-1.5 w-7 h-7 flex items-center justify-center rounded-full
                                        ${isToday ? 'bg-delaval-blue text-white shadow-sm' : 'text-slate-600'}
                                    `}>
                                        {day}
                                    </div>
                                    <div className="space-y-0.5">
                                        {dayJobs.slice(0, 3).map(job => (
                                            <div
                                                key={job.id}
                                                className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium truncate
                                                    ${statusConfig[job.status]?.text} ${statusConfig[job.status]?.bg.split(' ')[0]}`}
                                            >
                                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusConfig[job.status]?.dot}`} />
                                                <span className="truncate">{job.customers?.name || job.service_type}</span>
                                            </div>
                                        ))}
                                        {dayJobs.length > 3 && (
                                            <div className="text-[10px] text-slate-400 font-semibold pl-1">+{dayJobs.length - 3} more</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Desktop Sidebar */}
                <div className="space-y-4">
                    {/* Legend */}
                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Status Legend</h3>
                        <div className="grid grid-cols-2 gap-2.5">
                            {Object.entries(statusConfig).map(([, cfg]) => (
                                <div key={cfg.label} className="flex items-center gap-2">
                                    <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                                    <span className="text-xs text-slate-600 font-medium">{cfg.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Day Details */}
                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-900 mb-3">
                            {selectedDate
                                ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })
                                : 'Select a day'}
                        </h3>
                        {selectedDate ? (
                            selectedDateJobs.length > 0 ? (
                                <div className="space-y-2.5">
                                    {selectedDateJobs.map(job => (
                                        <Link to={`/jobs/${job.id}`} key={job.id} className="block">
                                            <div className="p-3 rounded-lg border border-slate-100 hover:border-delaval-blue/30 hover:shadow-sm transition-all group">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="font-bold text-sm text-slate-900 group-hover:text-delaval-blue transition-colors">#{job.job_number}</span>
                                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusConfig[job.status]?.dot} text-white`}>
                                                        {statusConfig[job.status]?.label}
                                                    </span>
                                                </div>
                                                <div className="text-sm text-slate-700 font-medium">{job.customers?.name || 'Unknown'}</div>
                                                {job.service_type && <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Wrench size={11} />{job.service_type}</div>}
                                                {job.engineer_name && <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><User size={11} />{job.engineer_name}</div>}
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400 italic text-center py-4">No jobs scheduled</p>
                            )
                        ) : (
                            <div className="text-center py-6">
                                <CalendarDays size={28} className="mx-auto text-slate-300 mb-2" />
                                <p className="text-sm text-slate-400">Click a day to view details</p>
                            </div>
                        )}
                    </div>

                    {/* Upcoming */}
                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Upcoming</h3>
                        <div className="space-y-2">
                            {upcomingJobs.slice(0, 5).map(job => (
                                <Link to={`/jobs/${job.id}`} key={job.id} className="flex items-center gap-3 py-1.5 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusConfig[job.status]?.dot}`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-slate-700 truncate">{job.customers?.name}</div>
                                        <div className="text-xs text-slate-400">{job.date_scheduled && formatDateLabel(job.date_scheduled)}</div>
                                    </div>
                                </Link>
                            ))}
                            {upcomingJobs.length === 0 && (
                                <p className="text-xs text-slate-400 italic text-center py-2">No upcoming jobs</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Create Job Modal */}
            <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Create New Job">
                <form onSubmit={handleCreateJob} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
                        <select required className="w-full px-4 py-2.5 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-delaval-blue/20"
                            value={newJob.customer_id} onChange={e => setNewJob({ ...newJob, customer_id: e.target.value })}>
                            <option value="">Select customer...</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Service Type</label>
                        <input required type="text" className="w-full px-4 py-2.5 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-delaval-blue/20"
                            value={newJob.service_type} onChange={e => setNewJob({ ...newJob, service_type: e.target.value })}
                            placeholder="e.g. M-Service, Repair" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Assign Engineer</label>
                            <select className="w-full px-4 py-2.5 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-delaval-blue/20"
                                value={newJob.engineer_name} onChange={e => setNewJob({ ...newJob, engineer_name: e.target.value })}>
                                <option value="">Select engineer...</option>
                                {engineers.map((eng: any) => <option key={eng.id} value={eng.name}>{eng.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Scheduled Date</label>
                            <DatePicker
                                required
                                value={newJob.date_scheduled}
                                onChange={(date) => setNewJob({ ...newJob, date_scheduled: date })}
                                placeholder="Pick a date..."
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                        <textarea rows={2} className="w-full px-4 py-2.5 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-delaval-blue/20"
                            value={newJob.notes} onChange={e => setNewJob({ ...newJob, notes: e.target.value })}
                            placeholder="Optional notes..." />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                        <button type="submit" className="px-6 py-2.5 bg-gradient-to-br from-delaval-blue to-[#124CA8] text-white rounded-lg font-bold shadow-lg shadow-blue-900/20">Create Job</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default CalendarPage;
