
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, supabaseAdmin } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { ArrowRight, Loader2, Mail, Lock, Key } from 'lucide-react';
import logoImg from '../assets/md_burke_logo.png';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState<'login' | 'forgot_password' | 'verify_otp'>('login');
    const navigate = useNavigate();
    const { showToast } = useToast();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (view === 'forgot_password') {
                // 1. Generate OTP
                const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

                // 2. Save OTP to database
                const { error: dbError } = await supabase.from('otps').insert([{
                    email: email.toLowerCase(),
                    otp: generatedOtp
                }]);
                if (dbError) throw new Error('Database error saving OTP. Did you run the SQL script?');

                // 3. Trigger user's Webhook
                const webhookResponse = await fetch('https://n8n.srv990376.hstgr.cloud/webhook/21f928ac-b128-4074-90f1-a7b1fb093e00', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email.toLowerCase(), otp: generatedOtp })
                });

                if (!webhookResponse.ok) throw new Error('Failed to send OTP via webhook');

                showToast('OTP sent to your email!', 'success');
                setView('verify_otp');
            } else if (view === 'verify_otp') {
                if (!supabaseAdmin) throw new Error('System configuration error: Missing Service Role Key.');

                // 1. Verify OTP against DB
                const { data: otpData, error: otpError } = await supabase
                    .from('otps')
                    .select('*')
                    .eq('email', email.toLowerCase())
                    .eq('otp', otp)
                    .eq('used', false)
                    .gte('expires_at', new Date().toISOString())
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (otpError || !otpData || otpData.length === 0) {
                    throw new Error('Invalid or expired OTP');
                }

                // 2. Mark OTP as used
                await supabase.from('otps').update({ used: true }).eq('id', otpData[0].id);

                // 3. Get User ID safely via our custom Postgres function
                const { data: userId, error: rpcError } = await supabase.rpc('get_user_id_by_email', { user_email: email.toLowerCase() });
                if (rpcError || !userId) {
                    throw new Error('User not found. Try registering instead.');
                }

                // 4. Update Password natively via Server Role Admin API
                const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
                if (updateError) throw updateError;

                showToast('Password updated successfully! You can now log in.', 'success');
                setView('login');
                setPassword('');
                setOtp('');
                setNewPassword('');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) throw error;

                showToast(`Successfully logged in!`, 'success');
                navigate('/');
            }
        } catch (error: any) {
            showToast(error.message || 'Authentication failed', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFB] p-4 relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-0 left-0 w-full h-[50vh] bg-gradient-to-br from-[#065F30] to-[#0066CC] skew-y-[-6deg] origin-top-left translate-y-[-20%] z-0"></div>

            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden relative z-10 animate-in fade-in zoom-in duration-300">
                <div className="p-8 pb-6 text-center">
                    <img src={logoImg} alt="MD Burke" className="h-[168px] w-auto mx-auto mb-4 mix-blend-multiply" />
                    <h1 className="text-2xl font-bold font-display text-slate-900">
                        {view === 'login' && 'Welcome Back'}
                        {view === 'forgot_password' && 'Reset Password'}
                        {view === 'verify_otp' && 'Enter Verification Code'}
                    </h1>
                    <p className="text-slate-500 mt-2">
                        {view === 'login' && 'Sign in to MD Burke Workshop Management'}
                        {view === 'forgot_password' && 'Enter your email to receive an OTP code'}
                        {view === 'verify_otp' && 'Check your email for the 6-digit OTP code'}
                    </p>
                </div>

                <form onSubmit={handleLogin} className="p-8 pt-0 space-y-5">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Email Address</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="email"
                                required
                                disabled={view === 'verify_otp'}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue outline-none transition-all disabled:bg-slate-50 disabled:text-slate-500"
                                placeholder="name@company.com"
                            />
                        </div>
                    </div>

                    {view === 'login' && (
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-slate-700">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue outline-none transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>
                    )}

                    {view === 'verify_otp' && (
                        <>
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-slate-700">OTP Code</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="text"
                                        required
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue outline-none transition-all text-center tracking-widest font-mono text-lg"
                                        placeholder="123456"
                                        maxLength={6}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-slate-700">New Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue outline-none transition-all"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    <div className="flex justify-between items-center text-sm">
                        {view === 'login' ? (
                            <button type="button" onClick={() => setView('forgot_password')} className="text-delaval-blue hover:underline font-medium">
                                Forgot Password?
                            </button>
                        ) : (
                            <button type="button" onClick={() => setView('login')} className="text-slate-500 hover:text-slate-800 font-medium">
                                Back to Login
                            </button>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-delaval-blue hover:bg-delaval-dark-blue text-white font-bold py-3 rounded-xl shadow-lg shadow-green-900/20 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                {view === 'login' && 'Signing in...'}
                                {view === 'forgot_password' && 'Sending OTP...'}
                                {view === 'verify_otp' && 'Verifying & Saving...'}
                            </>
                        ) : (
                            <>
                                {view === 'login' && 'Sign In'}
                                {view === 'forgot_password' && 'Send Code via Email'}
                                {view === 'verify_otp' && 'Verify & Update Password'}
                                <ArrowRight size={20} />
                            </>
                        )}
                    </button>


                </form>

                <div className="bg-slate-50 p-4 text-center text-xs text-slate-400 border-t border-slate-100">
                    Protected System. Authorized Access Only.
                </div>
            </div>
        </div>
    );
};

export default Login;
