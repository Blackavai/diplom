import React, { createContext, useContext, useState, ReactNode } from 'react';
import Cookies from 'js-cookie';

interface AuthContextType {
    user: any;
    token: string | null;
    setUser: (user: any) => void;
    setToken: (token: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<any>(JSON.parse(Cookies.get('userData') || 'null'));
    const [token, setToken] = useState<string | null>(Cookies.get('token') || null);

    const updateUser = (userData: any) => {
        setUser(userData);
        Cookies.set('userData', JSON.stringify(userData)); // Обновляем куки
    };

    return (
        <AuthContext.Provider value={{ user, token, setUser: updateUser, setToken }}>
            {children}
        </AuthContext.Provider>
    );
};


export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
