import { Bell, Plug as Plus, Users, FileText, Calendar, ArrowUpRight, Filter, Euro, Wrench, AlertCircle, Package } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Job } from '../types';
import { dataService } from '../services/dataService';
import { useAuth } from '../context/AuthContext';
import SearchableSelect from '../components/SearchableSelect';
import DatePicker from '../components/DatePicker';
const Dashboard = () => {
    const [stats, setStats] = useState({
        totalRevenue: 0,
        outstandingBalance: 0,
        activeJobs: 0,
        lowStockItems: 0,
        completedToday: 0
    });
    const [recentJobs, setRecentJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    const [filterType, setFilterType] = useState<'all' | 'month' | 'year' | 'custom'>('all');
    const [customRange, setCustomRange] = useState({
        start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });

    // Notifications State
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [notifications, setNotifications] = useState<{ id: string, title: string, message: string, type: 'warning' | 'error' | 'info', date: string }[]>([]);

    useEffect(() => {
        fetchData();
    }, [filterType, customRange]);

    const getEffectiveRange = () => {
        const now = new Date();
        if (filterType === 'month') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            return { start, end: now };
        }
        if (filterType === 'year') {
            const start = new Date(now.getFullYear(), 0, 1);
            return { start, end: now };
        }
        if (filterType === 'custom') {
            return {
                start: new Date(customRange.start),
                end: new Date(customRange.end)
            };
        }
        return { start: null, end: null };
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const userRole = user?.user_metadata?.role;
            const engineerName = userRole === 'Engineer' ? (user?.user_metadata?.name || user?.email?.split('@')[0]) : undefined;

            const [allJobs, inventoryArray] = await Promise.all([
                dataService.getJobs(undefined, engineerName),
                dataService.getInventory()
            ]);

            const { start, end } = getEffectiveRange();

            const filteredJobs = start && end
                ? allJobs.filter(job => {
                    if (!job.date_scheduled) return false;
                    const date = new Date(job.date_scheduled);
                    return date >= start && date <= end;
                })
                : allJobs;



            const activeJobsCount = filteredJobs.filter(j => ['Booked In', 'In Progress'].includes(j.status)).length;

            // Detailed Inventory Checks
            const outOfStockItems = inventoryArray.filter(i => i.stock_level <= 0);
            const lowStockItemsArr = inventoryArray.filter(i => i.stock_level > 0 && i.stock_level <= (i.low_stock_threshold || 5));
            const lowStockCount = outOfStockItems.length + lowStockItemsArr.length;


            // Calculate completed jobs today (mocked for visual via status)
            const completedCount = allJobs.filter(j => j.status === 'Completed').length;

            // Calculate Notifications
            const newNotifs: typeof notifications = [];

            if (outOfStockItems.length > 0) {
                const names = outOfStockItems.map(i => i.name).join(', ');
                newNotifs.push({
                    id: 'out-of-stock',
                    title: 'Out of Stock Alert',
                    message: `The following items are out of stock: ${names}`,
                    type: 'error',
                    date: new Date().toISOString()
                });
            }

            if (lowStockItemsArr.length > 0) {
                const names = lowStockItemsArr.map(i => i.name).join(', ');
                newNotifs.push({
                    id: 'low-stock',
                    title: 'Low Stock Alert',
                    message: `Running low: ${names}`,
                    type: 'warning',
                    date: new Date().toISOString()
                });
            }


            const todayStr = new Date().toISOString().split('T')[0];
            const jobsToday = allJobs.filter(j => j.date_scheduled && j.date_scheduled.startsWith(todayStr) && j.status !== 'Completed');
            if (jobsToday.length > 0) {
                newNotifs.push({
                    id: 'today-jobs',
                    title: 'Today\'s Schedule',
                    message: `You have ${jobsToday.length} active jobs scheduled for today.`,
                    type: 'info',
                    date: new Date().toISOString()
                });
            }

            setNotifications(newNotifs);

            setStats({
                totalRevenue: 0, // Migrated to external POS
                outstandingBalance: 0, // Migrated to external POS
                activeJobs: activeJobsCount,
                lowStockItems: lowStockCount,
                completedToday: completedCount
            });

            setRecentJobs(filteredJobs.slice(0, 5));
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value: number) => {
        if (value >= 1000000) {
            return `€${(value / 1000000).toFixed(1)}M`;
        }
        if (value >= 1000) {
            return `€${(value / 1000).toFixed(1)}K`;
        }
        return `€${value.toLocaleString()}`;
    };

    const statCards = [
        {
            label: 'Active Jobs',
            value: stats.activeJobs,
            icon: Wrench,
            color: 'bg-[#E6F9F3] text-[#14A637]',
            change: 'Scheduled & in progress',
            changeType: 'positive',
            link: '/jobs'
        },
        {
            label: 'Parts Alerts',
            value: stats.lowStockItems,
            icon: Package,
            color: 'bg-[#FFF3E6] text-[#FF6B00]',
            change: `${stats.lowStockItems} items low stock`,
            changeType: stats.lowStockItems > 0 ? 'negative' : 'positive',
            link: '/inventory'
        }
    ];

    const quickActions = [
        { icon: Plus, title: 'New Job', desc: 'Log a call-out', path: '/jobs', color: 'bg-blue-50 text-blue-600', mColor: 'bg-[#F0F6FF] text-[#1863DC]' },
        { icon: Wrench, title: 'Parts', desc: 'Search Parts', path: '/inventory', color: 'bg-green-50 text-green-600', mColor: 'bg-[#FFF3E6] text-[#FF6B00]' },
        { icon: Users, title: 'Customers', desc: 'Farms & contacts', path: '/customers', color: 'bg-delaval-light-blue text-delaval-blue', mColor: 'bg-[#E6F9F3] text-[#14A637]' },
        { icon: FileText, title: 'All Jobs', desc: 'Full list', path: '/jobs', color: 'bg-orange-50 text-orange-600', mColor: 'bg-[#FFE6E6] text-[#DC3545]' },
    ];

    // Format date for mobile header
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

    return (
        <>
            {/* DESKTOP VIEW - Hidden on Mobile */}
            <div className="hidden md:flex flex-col gap-8">
                {/* Header & Date Filter */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Dashboard Overview</h1>
                        <p className="text-slate-500 text-sm">Welcome back, {user?.user_metadata?.name || 'Administrator'}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="w-48">
                            <SearchableSelect
                                label=""
                                searchable={false}
                                options={[
                                    { value: 'all', label: 'All Time' },
                                    { value: 'month', label: 'This Month' },
                                    { value: 'year', label: 'This Year' },
                                    { value: 'custom', label: 'Custom Range' }
                                ]}
                                value={filterType}
                                onChange={(val) => setFilterType(val as any)}
                                icon={<Filter size={14} />}
                            />
                        </div>

                        {filterType === 'custom' && (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-300">
                                <div className="w-40">
                                    <DatePicker
                                        value={customRange.start}
                                        onChange={(date) => setCustomRange({ ...customRange, start: date })}
                                        placeholder="Start Date"
                                    />
                                </div>
                                <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">to</span>
                                <div className="w-40">
                                    <DatePicker
                                        value={customRange.end}
                                        onChange={(date) => setCustomRange({ ...customRange, end: date })}
                                        placeholder="End Date"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                    {statCards.map((stat, index) => {
                        const Icon = stat.icon;
                        return (
                            <Link key={index} to={stat.link} className="stat-card group block">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <div className="text-4xl font-bold font-display text-slate-900 mb-1 tracking-tight">
                                            {loading ? '-' : stat.value}
                                        </div>
                                        <div className="font-medium text-slate-500 mb-1 text-sm">{stat.label}</div>
                                        <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md mt-1
                                                    ${stat.changeType === 'positive' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                            {stat.change}
                                        </div>
                                    </div>
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-transform group-hover:scale-110 ${stat.color}`}>
                                        <Icon size={24} />
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {quickActions.map((action, index) => {
                        const Icon = action.icon;
                        return (
                            <Link key={index} to={action.path} className="group relative bg-white rounded-xl p-6 shadow-sm border-2 border-transparent hover:border-delaval-blue transition-all hover:-translate-y-1 hover:shadow-lg overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-delaval-light-blue to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                <div className="relative z-10">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 text-delaval-blue bg-[#F0F6FF]`}>
                                        <Icon size={20} />
                                    </div>
                                    <div className="font-bold text-slate-900 mb-1">{action.title}</div>
                                    <div className="text-xs text-slate-500">{action.desc}</div>
                                </div>
                            </Link>
                        )
                    })}
                </div>

                {/* Recent Jobs Table */}
                <div className="section-card">
                    <div className="flex justify-between items-center p-6 border-b border-slate-100">
                        <h2 className="text-xl font-bold font-display text-slate-900">Recent Jobs</h2>
                        <div className="flex gap-3">
                            <Link to="/jobs" className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 font-semibold text-sm hover:bg-slate-50 hover:text-delaval-blue transition-colors">
                                View All
                            </Link>
                            <Link to="/jobs" className="px-4 py-2 bg-gradient-to-br from-delaval-blue to-delaval-dark-blue text-white rounded-lg font-semibold text-sm shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
                                + New Job
                            </Link>
                        </div>
                    </div>
                    <div className="overflow-x-auto p-0">
                        <table className="w-full text-left">
                            <thead className="bg-[#F8FAFB] border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Job ID</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Engineer</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Loading jobs...</td></tr>
                                ) : recentJobs.map((job) => (
                                    <tr key={job.id} className="hover:bg-slate-50/80 transition-colors group cursor-pointer">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="font-bold text-slate-900">#{job.job_number}</div>
                                                <Link to={`/jobs/${job.id}`} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-delaval-blue transition-colors">
                                                    <ArrowUpRight size={16} />
                                                </Link>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-[#F0F6FF] text-[#1863DC] flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
                                                    {job.customers?.name?.substring(0, 2).toUpperCase()}
                                                </div>
                                                <span className="font-medium text-slate-700">{job.customers?.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{job.service_type}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{job.engineer_name}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{job.date_scheduled?.split('T')[0]}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                                                    ${job.status === 'Completed' ? 'bg-green-100 text-green-800' :
                                                    job.status === 'In Progress' ? 'bg-orange-100 text-orange-800' :
                                                        'bg-blue-100 text-blue-800'}`}>
                                                {job.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {recentJobs.length === 0 && !loading && (
                                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400 italic">No recent jobs found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* MOBILE VIEW - Exact App Design Match (Hidden on Desktop) */}
            <div className="block md:hidden pb-12 w-full max-w-[100vw] overflow-x-hidden text-[#1a1a1a]">

                {/* Fixed App Header */}
                <div className="bg-[#1863DC] text-white pt-10 pb-20 px-6 relative w-full">
                    <div
                        onClick={() => setIsNotificationsOpen(true)}
                        className="absolute top-10 right-6 opacity-80 backdrop-blur border border-white/20 rounded-full p-2 bg-white/10 z-10 w-9 h-9 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                    >
                        <Bell size={18} />
                        {notifications.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-[#1863DC]"></span>}
                    </div>

                    <p className="text-[#a0c5ea] text-xs font-semibold mb-1 uppercase tracking-wider opacity-90">{formattedDate}</p>
                    <h1 className="text-2xl font-bold mb-1 tracking-tight">
                        Good morning, {(user?.user_metadata?.name || user?.email?.split('@')[0])?.split(' ')[0] || 'Seán'} 👋
                    </h1>
                    <p className="text-[#a0c5ea] text-sm font-medium">MD Bruke</p>
                </div>

                {/* Overlapping Stats Bar */}
                <div className="px-5 -mt-10 relative z-10 mb-8 w-full max-w-[400px] mx-auto">
                    <div className="flex gap-3 justify-between">
                        <div className="bg-white rounded-[1.25rem] p-4 flex-1 shadow-[0_8px_20px_rgba(0,0,0,0.06)] border border-slate-100/50 flex flex-col items-center justify-center">
                            <span className="text-[28px] font-black text-[#FF6B00] leading-none mb-1">{loading ? '-' : stats.activeJobs}</span>
                            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Today</span>
                        </div>
                        <div className="bg-white rounded-[1.25rem] p-4 flex-1 shadow-[0_8px_20px_rgba(0,0,0,0.06)] border border-slate-100/50 flex flex-col items-center justify-center">
                            <span className="text-[28px] font-black text-[#5C24D9] leading-none mb-1">{loading ? '-' : stats.lowStockItems}</span>
                            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Parts Low</span>
                        </div>
                        <div className="bg-white rounded-[1.25rem] p-4 flex-1 shadow-[0_8px_20px_rgba(0,0,0,0.06)] border border-slate-100/50 flex flex-col items-center justify-center">
                            <span className="text-[28px] font-black text-[#14A637] leading-none mb-1">{loading ? '-' : stats.completedToday}</span>
                            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Done</span>
                        </div>
                    </div>
                </div>

                {/* 2x2 Quick Action Grid */}
                <div className="px-5 grid grid-cols-2 gap-4 mb-10 w-full max-w-[400px] mx-auto">
                    {quickActions.slice(0, 4).map((action, index) => {
                        const Icon = action.icon;
                        return (
                            <Link key={index} to={action.path} className="bg-white rounded-[1.25rem] p-5 shadow-[0_4px_16px_rgba(0,0,0,0.03)] border border-slate-100 flex flex-col items-start active:scale-[0.98] active:bg-slate-50 transition-all">
                                <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${action.mColor}`}>
                                    <Icon size={20} />
                                </div>
                                <h3 className="font-bold text-slate-900 text-base">{action.title}</h3>
                                <p className="text-xs text-slate-500 font-medium">{action.desc}</p>
                            </Link>
                        )
                    })}
                </div>

                {/* Today's Jobs List */}
                <div className="px-5 w-full max-w-[400px] mx-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xs uppercase font-bold text-slate-500 tracking-widest pl-1">Today's Jobs</h2>
                        <Link to="/jobs" className="text-sm font-bold text-[#1863DC]">See all</Link>
                    </div>

                    <div className="space-y-3 pb-8">
                        {loading ? (
                            <div className="text-center py-8 text-slate-400">Loading jobs...</div>
                        ) : recentJobs.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-sm">
                                <Calendar size={32} className="mx-auto text-slate-200 mb-3 opacity-50" />
                                No recent activity found.
                            </div>
                        ) : recentJobs.map((job) => (
                            <Link key={job.id} to={`/jobs/${job.id}`} className="block bg-white border border-slate-100 rounded-[1.25rem] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] active:scale-[0.99] transition-transform">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-bold text-slate-900 text-base leading-tight pr-2">{job.customers?.name || 'Unknown Farm'}</h3>
                                    <span className={`inline-flex whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide
                                        ${job.status === 'Completed' ? 'bg-[#E6F9F3] text-[#14A637]' :
                                            job.status === 'In Progress' ? 'bg-[#FFF3E6] text-[#FF6B00]' :
                                                'bg-[#F0F6FF] text-[#1863DC]'}`}>
                                        {job.status.replace('_', ' ')}
                                    </span>
                                </div>
                                <p className="text-[#334155] text-sm mb-3">
                                    {job.service_type === 'Emergency Repair' ? 'Milking machine — VMS V300' :
                                        job.service_type === 'Routine Maintenance' ? 'Annual service' :
                                            'Cluster replacement'}
                                </p>
                                <div className="flex items-center text-[#64748B] text-xs font-medium">
                                    <span>{job.date_scheduled ? new Date(job.date_scheduled).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '11:30'}</span>
                                    <span className="mx-1.5 opacity-50">•</span>
                                    <span>{job.engineer_name?.split(' ')[0] || 'Seán'}</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* NOTIFICATIONS SLIDER OVERLAY */}
                {isNotificationsOpen && (
                    <div className="fixed inset-0 z-50 flex justify-end">
                        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setIsNotificationsOpen(false)} />
                        <div className="relative w-[320px] max-w-full h-full bg-[#f8fbfa] shadow-2xl flex flex-col animate-slide-in-right">
                            <div className="bg-white px-5 py-6 border-b border-slate-100 flex justify-between items-center shadow-sm">
                                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                    <Bell size={20} className="text-delaval-blue" />
                                    Notifications
                                </h3>
                                <button onClick={() => setIsNotificationsOpen(false)} className="text-slate-400 hover:text-slate-600 p-2">
                                    ✕
                                </button>
                            </div>
                            <div className="p-4 flex-1 overflow-y-auto space-y-3 bg-[#f8fbfa]">
                                {notifications.length === 0 ? (
                                    <div className="text-center py-10 text-slate-400 text-sm">
                                        <Bell size={32} className="mx-auto text-slate-200 mb-3 opacity-50" />
                                        No new notifications
                                    </div>
                                ) : (
                                    notifications.map(notif => (
                                        <div key={notif.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex gap-3 items-start">
                                            <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${notif.type === 'error' ? 'bg-red-50 text-red-600' :
                                                notif.type === 'warning' ? 'bg-amber-50 text-amber-600' :
                                                    'bg-blue-50 text-blue-600'
                                                }`}>
                                                {notif.type === 'error' && <AlertCircle size={16} />}
                                                {notif.type === 'warning' && <Package size={16} />}
                                                {notif.type === 'info' && <Calendar size={16} />}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-sm text-slate-800">{notif.title}</h4>
                                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{notif.message}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default Dashboard;
