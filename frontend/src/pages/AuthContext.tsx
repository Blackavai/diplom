import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Cookies from 'js-cookie';
import axios from 'axios';
import api, { onUnauthorized } from '@/lib/api';

interface AuthUser {
    id: number;
    fname: string;
    lname: string;
    tg_id: string;
    post: string;
    role: number;
}

type SessionStatus = 'checking' | 'authenticated' | 'anonymous' | 'error' | 'forbidden';

interface AuthContextType {
    user: AuthUser | null;
    token: string | null;
    setToken: (token: string | null) => void;
    status: SessionStatus;
    logout: () => void;
    retrySession: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    // userData is a cache only; identity and role always come from /protected.
    const [user, setUser] = useState<AuthUser | null>(null);
    const [token, setToken] = useState<string | null>(Cookies.get('token') || null);
    const [verifiedToken, setVerifiedToken] = useState<string | null>(null);
    const [status, setStatus] = useState<SessionStatus>(token ? 'checking' : 'anonymous');
    const [checkVersion, setCheckVersion] = useState(0);

    const updateToken = useCallback((nextToken: string | null) => {
        if (nextToken) Cookies.set('token', nextToken, { expires: 1 / 24 });
        else Cookies.remove('token');
        Cookies.remove('userData');
        Cookies.remove('tokenExpiration');
        setToken(nextToken);
        setUser(null);
        setVerifiedToken(null);
        setStatus(nextToken ? 'checking' : 'anonymous');
        setCheckVersion((value) => value + 1);
    }, []);
    const logout = useCallback(() => updateToken(null), [updateToken]);
    const retrySession = useCallback(() => {
        setStatus('checking');
        setCheckVersion((value) => value + 1);
    }, []);

    useEffect(() => onUnauthorized(logout), [logout]);

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        api.get<{ user: AuthUser }>('/auth/protected', {
            headers: { Authorization: `Bearer ${token}` }, timeout: 15000
        }).then(({ data }) => {
            if (cancelled) return;
            const cookieToken = Cookies.get('token') || null;
            if (cookieToken !== token) { updateToken(cookieToken); return; }
            if (!data.user || !Number.isInteger(data.user.id) || ![1, 2].includes(data.user.role)) {
                throw new Error('Некорректный ответ проверки сессии');
            }
            setUser(data.user);
            setVerifiedToken(token);
            setStatus('authenticated');
            Cookies.set('userData', JSON.stringify(data.user), { expires: 1 / 24 });
        }).catch((error: unknown) => {
            if (cancelled) return;
            const cookieToken = Cookies.get('token') || null;
            if (cookieToken !== token) { updateToken(cookieToken); return; }
            if (axios.isAxiosError(error) && error.response?.status === 401) { logout(); return; }
            setStatus(axios.isAxiosError(error) && error.response?.status === 403 ? 'forbidden' : 'error');
        });
        return () => { cancelled = true; };
    }, [token, checkVersion, logout, updateToken]);

    useEffect(() => {
        const onFocus = () => {
            const cookieToken = Cookies.get('token') || null;
            if (cookieToken !== token) updateToken(cookieToken);
            else if (token) retrySession();
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [token, updateToken, retrySession]);

    const checkedStatus = status === 'authenticated' && verifiedToken !== token ? 'checking' : status;

    return (
        <AuthContext.Provider value={{ user, token, setToken: updateToken, status: checkedStatus, logout, retrySession }}>
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
