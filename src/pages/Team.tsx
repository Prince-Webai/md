import React, { useEffect, useState } from 'react';
import { Plus, Search, Trash2, Mail, Phone, Pencil, ShieldCheck, UserCheck } from 'lucide-react';
import SearchableSelect from '../components/SearchableSelect';
import { supabase } from '../lib/supabase';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';

interface Engineer {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    status: 'active' | 'inactive';
}

const Team = () => {
    const [engineers, setEngineers] = useState<Engineer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newEngineer, setNewEngineer] = useState({
        name: '',
        email: '',
        phone: '',
        role: 'Engineer',
        status: 'active' as 'active' | 'inactive'
    });

    useEffect(() => {
        fetchEngineers();
    }, []);

    const fetchEngineers = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('engineers')
                .select('*')
                .order('name');

            if (error) throw error;
            setEngineers(data || []);
        } catch (error) {
            console.error('Error fetching engineers:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveEngineer = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingId) {
                // Update existing
                const { error } = await supabase
                    .from('engineers')
                    .update(newEngineer)
                    .eq('id', editingId);

                if (error) throw error;

                setEngineers(engineers.map(eng => eng.id === editingId ? { ...eng, ...newEngineer } : eng));
            } else {
                // Create Suapbase Auth user with default password user123
                const { error: authError } = await supabase.auth.signUp({
                    email: newEngineer.email,
                    password: 'user123',
                    options: {
                        data: {
                            full_name: newEngineer.name,
                            role: newEngineer.role
                        }
                    }
                });

                if (authError) {
                    console.error('Auth signup error:', authError);
                    // If user already exists, we might get an error, but we should continue or notify
                    if (!authError.message.includes('already registered')) {
                        throw authError;
                    }
                }

                // Create record in engineers table
                const { data, error } = await supabase
                    .from('engineers')
                    .insert([newEngineer])
                    .select();

                if (error) throw error;
                if (data) setEngineers([...engineers, data[0]]);
            }

            setIsModalOpen(false);
            setEditingId(null);
            setNewEngineer({ name: '', email: '', phone: '', role: 'Engineer', status: 'active' });

        } catch (error: any) {
            console.error('Error saving engineer:', error);
            alert(`Failed to save: ${error.message}`);
        }
    };

    const handleEditClick = (eng: Engineer) => {
        setNewEngineer({
            name: eng.name,
            email: eng.email,
            phone: eng.phone,
            role: eng.role,
            status: eng.status
        });
        setEditingId(eng.id);
        setIsModalOpen(true);
    };

    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);


    const handleDeleteClick = (id: string) => {
        setDeleteId(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase.from('engineers').delete().eq('id', deleteId);
            if (error) throw error;
            setEngineers(engineers.filter(eng => eng.id !== deleteId));
            setIsDeleteModalOpen(false);
            setDeleteId(null);
        } catch (error: any) {
            console.error('Error deleting engineer:', error);
            alert(`Failed to delete: ${error.message}`);
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredEngineers = engineers.filter(eng =>
        eng.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        eng.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* ... Header and Search ... */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold font-display text-slate-900">Team Management</h1>
                    <p className="text-slate-500">Manage engineers and staff members</p>
                </div>
                <button
                    onClick={() => {
                        setEditingId(null);
                        setNewEngineer({ name: '', email: '', phone: '', role: 'Engineer', status: 'active' });
                        setIsModalOpen(true);
                    }}
                    className="flex items-center gap-2 bg-delaval-blue hover:bg-delaval-dark-blue text-white px-4 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-blue-900/20"
                >
                    <Plus size={20} /> Add Member
                </button>
            </div>

            <div className="section-card p-6">
                <div className="relative mb-6 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search team members..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-delaval-blue/20 focus:border-delaval-blue transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loading ? (
                        <div className="col-span-full py-12 text-center text-slate-500">Loading team...</div>
                    ) : filteredEngineers.length === 0 ? (
                        <div className="col-span-full py-12 text-center text-slate-400 italic">No team members found. Add one to get started.</div>
                    ) : (
                        filteredEngineers.map(eng => (
                            <div key={eng.id} className="stat-card group relative hover:border-delaval-blue transition-colors">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-12 h-12 bg-blue-50 text-delaval-blue rounded-full flex items-center justify-center font-bold text-xl">
                                        {eng.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className={`px-2 py-1 rounded-full text-xs font-semibold ${eng.role === 'Admin' ? 'bg-delaval-blue text-white' : 'bg-blue-100 text-blue-800'}`}>
                                        {eng.role}
                                    </div>
                                </div>
                                <h3 className="font-bold text-lg text-slate-900 mb-1">{eng.name}</h3>
                                <div className="space-y-2 text-sm text-slate-500">
                                    <div className="flex items-center gap-2">
                                        <Mail size={14} /> {eng.email || 'No email'}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Phone size={14} /> {eng.phone || 'No phone'}
                                    </div>
                                </div>

                                <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleEditClick(eng); }}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-slate-500 hover:text-delaval-blue hover:bg-blue-50 rounded-lg transition-all"
                                    >
                                        <Pencil size={14} /> Edit
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteClick(eng.id); }}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    >
                                        <Trash2 size={14} /> Delete
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Edit Team Member" : "Add Team Member"}>
                <form onSubmit={handleSaveEngineer} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                        <input required type="text" className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-delaval-blue/20 outline-none"
                            value={newEngineer.name} onChange={e => setNewEngineer({ ...newEngineer, name: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-2 md:col-span-1">
                            <SearchableSelect
                                label="Role"
                                searchable={false}
                                options={[
                                    { value: 'Engineer', label: 'Engineer' },
                                    { value: 'Senior Engineer', label: 'Senior Engineer' },
                                    { value: 'Admin', label: 'Admin' },
                                    { value: 'Office Staff', label: 'Office Staff' }
                                ]}
                                value={newEngineer.role}
                                onChange={(val) => setNewEngineer({ ...newEngineer, role: val })}
                                icon={<ShieldCheck size={16} />}
                            />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <SearchableSelect
                                label="Status"
                                searchable={false}
                                options={[
                                    { value: 'active', label: 'Active' },
                                    { value: 'inactive', label: 'Inactive' }
                                ]}
                                value={newEngineer.status}
                                onChange={(val) => setNewEngineer({ ...newEngineer, status: val as 'active' | 'inactive' })}
                                icon={<UserCheck size={16} />}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                        <input type="email" className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-delaval-blue/20 outline-none"
                            value={newEngineer.email} onChange={e => setNewEngineer({ ...newEngineer, email: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                        <input type="tel" className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-delaval-blue/20 outline-none"
                            value={newEngineer.phone} onChange={e => setNewEngineer({ ...newEngineer, phone: e.target.value })} />
                    </div>
                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-delaval-blue text-white rounded-lg font-bold hover:bg-delaval-dark-blue">Save Member</button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Team Member"
                message="Are you sure you want to delete this team member? This action cannot be undone."
                isDestructive={true}
                isLoading={isDeleting}
                confirmText="Delete Member"
            />
        </div>
    );
};

export default Team;
