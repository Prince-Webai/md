import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from './layouts/Layout'
import Dashboard from './pages/Dashboard'
import Pipeline from './pages/Pipeline'
import Jobs from './pages/Jobs'
import Customers from './pages/Customers'
import Inventory from './pages/Inventory'
import Team from './pages/Team'
import Settings from './pages/Settings'
import JobDetails from './pages/JobDetails'
import Analytics from './pages/Analytics'

import Login from './pages/Login'
import { AuthProvider, useAuth } from './context/AuthContext'

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { session, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-[#F8FAFB]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-delaval-blue/30 border-t-delaval-blue rounded-full animate-spin"></div>
                    <div className="text-slate-500 font-medium animate-pulse">Loading MD Burke...</div>
                </div>
            </div>
        );
    }

    if (!session) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <>{children}</>;
};

// Admin-only Route Component
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-[#F8FAFB]">
                <div className="w-12 h-12 border-4 border-delaval-blue/30 border-t-delaval-blue rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    const isAdmin = user.user_metadata?.role !== 'Engineer';
    if (!isAdmin) {
        return <Navigate to="/jobs" replace />;
    }

    return <>{children}</>;
};

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />

                    {/* Protected Routes */}
                    <Route path="/" element={
                        <AdminRoute>
                            <Layout>
                                <Dashboard />
                            </Layout>
                        </AdminRoute>
                    } />
                    <Route path="/analytics" element={
                        <AdminRoute>
                            <Layout>
                                <Analytics />
                            </Layout>
                        </AdminRoute>
                    } />
                    <Route path="/pipeline" element={
                        <AdminRoute>
                            <Layout>
                                <Pipeline />
                            </Layout>
                        </AdminRoute>
                    } />
                    <Route path="/jobs" element={
                        <ProtectedRoute>
                            <Layout>
                                <Jobs />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/customers" element={
                        <ProtectedRoute>
                            <Layout>
                                <Customers />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/inventory" element={
                        <ProtectedRoute>
                            <Layout>
                                <Inventory />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="/team" element={
                        <AdminRoute>
                            <Layout>
                                <Team />
                            </Layout>
                        </AdminRoute>
                    } />
                    <Route path="/settings" element={
                        <AdminRoute>
                            <Layout>
                                <Settings />
                            </Layout>
                        </AdminRoute>
                    } />

                    <Route path="/jobs/:id" element={
                        <ProtectedRoute>
                            <Layout>
                                <JobDetails />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    )
}

export default App
