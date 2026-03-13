import React, { useState, useEffect } from 'react';
import { Menu, LayoutDashboard, Wrench, Users, Package, FileText, LogOut, User, Euro, PieChart, FileCheck, Kanban, Settings as SettingsIcon } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import logoImg from '../assets/md_burke_logo.png';


const Layout = ({ children }: { children: React.ReactNode }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { user, signOut } = useAuth();

    // State for user name display
    const [userName, setUserName] = useState('Admin User');

    // Update form state when user loads
    useEffect(() => {
        if (user) {
            setUserName(user.user_metadata?.name || user.email?.split('@')[0] || 'Admin User');
        }
    }, [user]);

    const handleSignOut = async () => {

        try {
            await signOut();
            // Navigation to login is handled by ProtectedRoute/AuthContext state change
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    const navSections = [
        {
            title: 'Main',
            items: [
                { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
                { icon: Wrench, label: 'Jobs & Services', path: '/jobs' },
                { icon: Kanban, label: 'Pipeline', path: '/pipeline' },
                { icon: Users, label: 'Customers', path: '/customers' },
            ]
        },
        {
            title: 'Inventory',
            items: [
                { icon: Package, label: 'Parts Inventory', path: '/inventory' },
            ]
        },
        {
            title: 'Admin',
            items: [
                ...(user?.user_metadata?.role !== 'Engineer' ? [
                    { icon: PieChart, label: 'Analytics', path: '/analytics' },
                    { icon: Users, label: 'Team & Engineers', path: '/team' },
                ] : []),
            ]
        },
    ];

    // Mobile Bottom Nav Structure
    const mobileNavItems = [
        { icon: LayoutDashboard, label: 'Home', path: '/' },
        { icon: FileText, label: 'Jobs', path: '/jobs' },
        { icon: Users, label: 'Customers', path: '/customers' },
        { icon: Package, label: 'Parts', path: '/inventory' },
    ];

    const closeSidebar = () => setIsSidebarOpen(false);

    return (
        <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#F8FAFB] font-sans text-[#1a1a1a] relative">
            {/* Header - Hidden on mobile, visible on desktop */}
            <header className="hidden md:block sticky top-0 z-[1000] bg-white shadow-sm h-[110px] transition-colors w-full">
                <div className="max-w-[1600px] w-full mx-auto h-full px-8 flex justify-between items-center">

                    {/* Logo Section */}
                    <div className="flex items-center h-full">
                        <img
                            src={logoImg}
                            alt="MD Burke"
                            className="h-[110px] w-auto object-contain scale-[1.3] origin-left mix-blend-multiply"
                        />
                    </div>

                    {/* Desktop User Info Only */}
                    <div className="hidden md:flex items-center gap-4">
                        <button
                            onClick={() => navigate('/settings')}
                            className="p-2 text-slate-400 hover:text-delaval-blue hover:bg-green-50 rounded-full transition-colors"
                            title="Settings"
                        >
                            <SettingsIcon size={20} />
                        </button>

                        <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-full border border-slate-200">
                            <div className="w-9 h-9 rounded-full bg-delaval-blue text-white flex items-center justify-center font-bold">
                                <User size={20} />
                            </div>
                            <div className="text-slate-700 text-sm font-medium pr-2">
                                {userName}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Container */}
            <div className="max-w-[1600px] w-full mx-auto min-h-screen md:p-4 lg:p-8 flex flex-col md:grid lg:grid-cols-[280px_1fr] gap-0 md:gap-8 bg-[#F8FAFB]">

                {/* Sidebar - Desktop & Mobile Drawer */}
                <aside className={`
          fixed md:static inset-0 z-[1100] md:z-auto
          ${isSidebarOpen ? 'bg-black/50 pointer-events-auto' : 'bg-transparent pointer-events-none md:pointer-events-auto'}
          transition-all duration-300
        `} onClick={closeSidebar}>

                    <div onClick={e => e.stopPropagation()} className={`
            bg-white md:bg-white rounded-r-2xl md:rounded-2xl p-6 shadow-2xl md:shadow-[0_4px_12px_rgba(0,81,165,0.12)] h-full md:h-fit sticky top-0 md:top-[120px]
            w-[280px] max-w-[85vw] transform transition-transform duration-300
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          `}>


                        {navSections.map((section, idx) => (
                            <div key={idx} className="mb-6 last:mb-0">
                                <h3 className="text-xs uppercase tracking-widest text-[#0A8043]/60 font-bold mb-3 px-3">{section.title}</h3>
                                <nav className="space-y-1">
                                    {section.items.map((item) => {
                                        const Icon = item.icon;
                                        const isActive = location.pathname === item.path;

                                        return (
                                            <Link
                                                key={item.path}
                                                to={item.path}
                                                onClick={closeSidebar}
                                                className={`
                            flex items-center gap-3 px-3 py-3.5 rounded-xl font-medium transition-all duration-200
                            ${isActive
                                                        ? 'bg-gradient-to-br from-[#0A8043] to-[#065F30] text-white shadow-[0_4px_12px_rgba(0,81,165,0.3)] relative overflow-hidden pl-4'
                                                        : 'text-[#1a1a1a] hover:bg-[#E6F4EA] hover:text-[#0A8043] hover:translate-x-1'
                                                    }
                          `}
                                            >
                                                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-[60%] bg-[#FF6B00] rounded-r"></div>}
                                                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                                                {item.label}
                                            </Link>
                                        );
                                    })}
                                </nav>
                            </div>
                        ))}

                        <div className="pt-6 border-t border-slate-100 mt-6">
                            <button
                                onClick={handleSignOut}
                                className="w-full flex items-center gap-3 px-3 py-3 text-slate-600 hover:bg-slate-50 hover:text-red-600 rounded-xl font-medium transition-colors"
                            >
                                <LogOut size={20} />
                                Sign Out
                            </button>
                        </div>

                    </div>
                </aside>

                <main className="min-w-0 flex-1 w-full max-w-full pb-28 md:pb-0 overflow-x-hidden">
                    {children}
                </main>
            </div>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 w-full max-w-full bg-white border-t border-slate-200 flex justify-around items-center px-1 pt-3 pb-5 z-[2000] shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
                {mobileNavItems.map((item) => {
                    const Icon = item.icon;
                    // Strict active checking for home, looser for others
                    const isActive = item.path === '/'
                        ? location.pathname === '/'
                        : location.pathname.startsWith(item.path);

                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex flex-col items-center gap-1 transition-colors px-2 border-t-2 ${isActive ? 'text-[#0A8043] border-[#0A8043]' : 'text-slate-400 border-transparent'}`}
                        >
                            <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                            <span className="text-[9px] uppercase font-bold tracking-wider">{item.label}</span>
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
};

export default Layout;
