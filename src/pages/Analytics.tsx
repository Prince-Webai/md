import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { dataService } from '../services/dataService';
import { Calendar, CheckCircle, Package, Settings, Users, ArrowUpRight, ArrowDownRight, Filter } from 'lucide-react';

const Analytics = () => {
    const [stats, setStats] = useState<any>({
        totalJobs: 0,
        completionRate: 0,
        topService: 'N/A',
        partsUsed: 0,
        jobTrend: [],
        pipelineDist: [],
        topParts: []
    });
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<number | 'custom'>(7); // default 7 days
    const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        fetchAnalyticsData();
    }, [timeRange, startDate, endDate]);

    const fetchAnalyticsData = async () => {
        try {
            setLoading(true);
            const { jobs, items } = await dataService.getAnalyticsData(
                timeRange === 'custom' ? startDate : timeRange,
                timeRange === 'custom' ? endDate : undefined
            );
            const topParts = await dataService.getTopUsedParts(5);

            // 1. Calculate Summary Stats
            const completedJobs = jobs.filter((j: any) => j.status === 'Completed').length;
            const completionRate = jobs.length > 0 ? Math.round((completedJobs / jobs.length) * 100) : 0;

            // 2. Pipeline Stage Distribution
            const statusCounts: any = {};
            jobs.forEach((j: any) => {
                const status = j.status || 'Booked In';
                statusCounts[status] = (statusCounts[status] || 0) + 1;
            });
            const pipelineDist = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

            // Keeping service mix for the "Top Service" metric only
            const serviceCounts: any = {};
            jobs.forEach((j: any) => {
                const type = j.service_type || 'General';
                serviceCounts[type] = (serviceCounts[type] || 0) + 1;
            });
            const serviceMix = Object.entries(serviceCounts).map(([name, value]) => ({ name, value }));
            const topService = serviceMix.sort((a: any, b: any) => b.value - a.value)[0]?.name || 'N/A';

            // 3. Parts Used Total
            const totalParts = items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);

            // 4. Job Trend Data
            const chartDataPoints: any[] = [];
            const daysToChart = timeRange === 'custom' 
                ? Math.min(Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 3600 * 24)) + 1, 90)
                : timeRange;

            const baseDate = timeRange === 'custom' ? new Date(endDate) : new Date();

            for (let i = daysToChart - 1; i >= 0; i--) {
                const d = new Date(baseDate);
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                const jobsOnDate = jobs.filter((j: any) => j.created_at && j.created_at.startsWith(dateStr));

                chartDataPoints.push({
                    name: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
                    value: jobsOnDate.length
                });
            }

            setStats({
                totalJobs: jobs.length,
                completionRate,
                topService,
                partsUsed: totalParts,
                jobTrend: chartDataPoints,
                pipelineDist,
                topParts
            });
        } catch (error) {
            console.error('Error fetching analytics data:', error);
        } finally {
            setLoading(false);
        }
    };

    const COLORS = ['#0A8043', '#0051A5', '#FF6B00', '#6366F1', '#EC4899'];

    return (
        <div className="space-y-8 max-w-7xl mx-auto w-full pb-20 px-4 pt-4">
            {/* Header with Filter */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black font-display text-slate-900 tracking-tight">Workshop Insights</h1>
                    <p className="text-slate-500 font-medium">Monitoring operational throughput and efficiency</p>
                </div>
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 bg-white p-2 sm:p-3 rounded-2xl border border-slate-200 shadow-sm w-full md:w-auto">
                    <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-xl border border-slate-100 w-full md:w-auto overflow-x-auto no-scrollbar">
                        {[
                            { label: '7D', value: 7 },
                            { label: '30D', value: 30 },
                            { label: '90D', value: 90 },
                            { label: 'Year', value: 365 },
                            { label: 'Custom', value: 'custom' as const }
                        ].map((range) => (
                            <button
                                key={range.label}
                                onClick={() => setTimeRange(range.value)}
                                className={`flex-1 md:flex-none px-3 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${timeRange === range.value ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20' : 'text-slate-500 hover:text-slate-900 hover:bg-white'}`}
                            >
                                {range.label}
                            </button>
                        ))}
                    </div>

                    {timeRange === 'custom' && (
                        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-2 animate-in slide-in-from-right-4 duration-300 w-full md:w-auto border-t sm:border-t-0 sm:border-l border-slate-200 pt-4 sm:pt-0 sm:pl-4">
                            <div className="relative w-full sm:w-auto">
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-delaval-blue/20 outline-none"
                                />
                                <div className="absolute -top-4 left-0 text-[10px] font-black text-slate-400 uppercase tracking-widest">Start</div>
                            </div>
                            <span className="hidden sm:inline text-slate-300 font-bold">→</span>
                            <div className="relative w-full sm:w-auto">
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-delaval-blue/20 outline-none"
                                />
                                <div className="absolute -top-4 left-0 text-[10px] font-black text-slate-400 uppercase tracking-widest">End</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard
                    title="Total Jobs"
                    value={stats.totalJobs}
                    icon={<Calendar className="text-blue-600" size={24} />}
                    trend="+12%"
                    color="bg-blue-50"
                    loading={loading}
                />
                <MetricCard
                    title="Completion Rate"
                    value={`${stats.completionRate}%`}
                    icon={<CheckCircle className="text-emerald-600" size={24} />}
                    trend="+5%"
                    color="bg-emerald-50"
                    loading={loading}
                />
                <MetricCard
                    title="Top Service"
                    value={stats.topService}
                    icon={<Settings className="text-orange-600" size={24} />}
                    trend="Steady"
                    color="bg-orange-50"
                    loading={loading}
                />
                <MetricCard
                    title="Parts Consumed"
                    value={stats.partsUsed}
                    icon={<Package className="text-indigo-600" size={24} />}
                    trend="+18%"
                    color="bg-indigo-50"
                    loading={loading}
                />
            </div>

            {/* Main Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Volume Trend */}
                <div className="lg:col-span-2 section-card p-4 sm:p-8">
                    <div className="flex justify-between items-center mb-6 sm:mb-8">
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-900">Workflow Volume</h2>
                            <p className="text-xs sm:text-sm font-medium text-slate-400">Scheduled throughput over time</p>
                        </div>
                    </div>
                    <div className="h-[300px] w-full">
                        {loading ? (
                            <div className="h-full flex items-center justify-center text-slate-400 font-medium">Analyzing trends...</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={stats.jobTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" horizontal={false} />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                                        dy={10}
                                        interval={(typeof timeRange === 'number' && timeRange > 7) || timeRange === 'custom' ? 'preserveStartEnd' : 0}
                                    />
                                    <YAxis hide domain={['dataMin', 'dataMax + 2']} />
                                    <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: '#f1f5f9', strokeWidth: 2 }} />
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        stroke="#0A8043"
                                        strokeWidth={4}
                                        dot={false}
                                        activeDot={{ r: 6, fill: '#0A8043', stroke: '#fff', strokeWidth: 2 }}
                                        animationDuration={1500}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Pipeline Distribution */}
                <div className="section-card p-8">
                    <h2 className="text-lg font-black text-slate-900 mb-1">Pipeline</h2>
                    <p className="text-sm font-medium text-slate-400 mb-6">Distribution by job stage</p>
                    <div className="h-[250px] w-full relative">
                        {loading ? (
                            <div className="h-full flex items-center justify-center text-slate-400 font-medium">Categorizing...</div>
                        ) : stats.pipelineDist.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.pipelineDist}
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        animationBegin={200}
                                    >
                                        {stats.pipelineDist.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-white p-2 rounded-lg shadow-xl border border-slate-100 text-xs font-bold">
                                                        {payload[0].name}: {payload[0].value}
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 font-medium text-sm">No distribution data</div>
                        )}
                        {!loading && stats.pipelineDist.length > 0 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-2xl font-black text-slate-900">{stats.totalJobs}</span>
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Jobs</span>
                            </div>
                        )}
                    </div>
                    <div className="space-y-3 mt-4">
                        {stats.pipelineDist.slice(0, 4).map((item: any, idx: number) => (
                            <div key={item.name} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                    <span className="text-xs font-bold text-slate-600 truncate max-w-[120px]">{item.name}</span>
                                </div>
                                <span className="text-xs font-black text-slate-900">{Math.round((item.value / stats.totalJobs) * 100)}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Inventory Usage Trends */}
            <div className="section-card p-8">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-lg font-black text-slate-900">Highest Use Inventory</h2>
                        <p className="text-sm font-medium text-slate-400">Most consumed parts across all jobs</p>
                    </div>
                    <button className="text-xs font-black text-delaval-blue uppercase tracking-widest hover:underline">View Catalog</button>
                </div>
                {loading ? (
                    <div className="py-20 text-center text-slate-400 font-medium">Scanning inventory movement...</div>
                ) : stats.topParts.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left">
                                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Part Identification</th>
                                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Movement</th>
                                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Popularity</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {stats.topParts.map((part: any, idx: number) => (
                                    <tr key={idx} className="group">
                                        <td className="py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-green-50 group-hover:text-green-600 transition-colors">
                                                    <Package size={18} />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-black text-slate-900">{part.name}</div>
                                                    <div className="text-[11px] font-bold text-slate-400 font-mono">{part.sku}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 text-center">
                                            <span className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 font-black text-xs">
                                                {part.count} Units Used
                                            </span>
                                        </td>
                                        <td className="py-4">
                                            <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-[#0A8043] rounded-full"
                                                    style={{ width: `${(part.count / stats.topParts[0].count) * 100}%` }}
                                                ></div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="py-20 text-center text-slate-400 font-medium">No inventory usage detected for this period.</div>
                )}
            </div>
        </div>
    );
};

// Sub-components for cleaner structure
const MetricCard = ({ title, value, icon, trend, color, loading }: any) => (
    <div className="section-card p-6 group hover:shadow-xl transition-all duration-300">
        <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-2xl ${color} group-hover:scale-110 transition-transform`}>
                {icon}
            </div>
            {trend && (
                <div className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full ${trend.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'}`}>
                    {trend.startsWith('+') ? <ArrowUpRight size={12} /> : null}
                    {trend}
                </div>
            )}
        </div>
        {loading ? (
            <div className="h-8 w-24 bg-slate-100 animate-pulse rounded-lg"></div>
        ) : (
            <div className="text-2xl font-black text-slate-900 tracking-tight">{value}</div>
        )}
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{title}</div>
    </div>
);

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-slate-100 min-w-[150px]">
                <p className="text-[#1a1a1a] font-black text-[11px] uppercase tracking-widest mb-3 text-slate-400">Time Segment</p>
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-3 h-3 rounded-full bg-[#0A8043] shadow-[0_0_8px_rgba(10,128,67,0.4)]"></div>
                    <p className="text-[#1a1a1a] text-[13px] font-black">{label}</p>
                </div>
                <div className="bg-green-50 px-3 py-2 rounded-xl">
                    <p className="text-green-700 font-black text-[14px]">
                        {payload[0].value} {payload[0].value === 1 ? 'Job' : 'Jobs'}
                    </p>
                </div>
            </div>
        );
    }
    return null;
};

export default Analytics;
