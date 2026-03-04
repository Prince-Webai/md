import React, { createContext, useContext, useState } from 'react';

interface AuthContextType {
    user: any;
    session: any;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user] = useState({
        id: 1,
        email: 'admin@mdbruke.com',
        user_metadata: {
            name: 'Admin User',
            role: 'Admin'
        }
    });

    return (
        <AuthContext.Provider value={{
            user,
            session: { user },
            loading: false,
            signOut: async () => { } // Mock sign out
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
