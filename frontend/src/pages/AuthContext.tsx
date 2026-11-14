import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Cookies from 'js-cookie';
import axios from 'axios';
import { toast } from 'sonner';
import api, { publicApi, onUnauthorized, setVerifiedSessionToken } from '@/lib/api';

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
    isCheckingSession: boolean;
    sessionError: string | null;
    logout: () => Promise<void>;
    retrySession: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    // userData — только кеш; пользователя и роль подтверждает сервер.
    const [user, setUser] = useState<AuthUser | null>(null);
    const [token, setToken] = useState<string | null>(Cookies.get('token') || null);
    const [verifiedToken, setVerifiedToken] = useState<string | null>(null);
    const [status, setStatus] = useState<SessionStatus>(token ? 'checking' : 'anonymous');
    const [checkVersion, setCheckVersion] = useState(0);
    const [isCheckingSession, setIsCheckingSession] = useState(Boolean(token));
    const [sessionError, setSessionError] = useState<string | null>(null);

    const updateToken = useCallback((nextToken: string | null) => {
        setVerifiedSessionToken(null);
        if (nextToken) Cookies.set('token', nextToken, { expires: 1 / 24 });
        else Cookies.remove('token');
        Cookies.remove('userData');
        Cookies.remove('tokenExpiration');
        setToken(nextToken);
        setUser(null);
        setVerifiedToken(null);
        setStatus(nextToken ? 'checking' : 'anonymous');
        setIsCheckingSession(Boolean(nextToken));
        setSessionError(null);
        setCheckVersion((value) => value + 1);
    }, []);
    const clearLocalSession = useCallback(() => updateToken(null), [updateToken]);
    const logout = useCallback(async () => {
        const outgoingToken = Cookies.get('token');
        clearLocalSession();
        if (!outgoingToken) return;
        try {
            // Выход доступен и при неудавшейся проверке сессии. Не запускаем
            // обработчики 401 защищённого клиента повторно.
            await publicApi.post('/auth/logout', {}, {
                headers: { Authorization: `Bearer ${outgoingToken}` }, timeout: 15000
            });
            if (!Cookies.get('token')) toast.success('Все сессии завершены');
        } catch (error: unknown) {
            if (Cookies.get('token')) return;
            if (axios.isAxiosError(error) && error.response?.status === 401) {
                toast.success('Сессия уже завершена');
            } else {
                toast.error('Вы вышли на этом устройстве. Серверный отзыв сессий не подтверждён.');
            }
        }
    }, [clearLocalSession]);
    const retrySession = useCallback(() => {
        setVerifiedSessionToken(null);
        setIsCheckingSession(true);
        setSessionError(null);
        // Фоновая проверка прежней сессии сохраняет страницу и её формы.
        setStatus((currentStatus) => {
            if (currentStatus === 'authenticated') return currentStatus;
            return 'checking';
        });
        setCheckVersion((value) => value + 1);
    }, []);

    useEffect(() => onUnauthorized(clearLocalSession), [clearLocalSession]);

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        setVerifiedSessionToken(null);
        async function checkSession() {
            try {
                const { data } = await api.get<{ user: AuthUser }>('/auth/protected', {
                    headers: { Authorization: `Bearer ${token}` }, timeout: 15000
                });
                if (cancelled) return;
                const cookieToken = Cookies.get('token') || null;
                if (cookieToken !== token) { updateToken(cookieToken); return; }
                if (!data.user || !Number.isInteger(data.user.id) || ![1, 2].includes(data.user.role)) {
                    throw new Error('Некорректный ответ проверки сессии');
                }
                setUser(data.user);
                setVerifiedToken(token);
                setStatus('authenticated');
                setIsCheckingSession(false);
                setSessionError(null);
                setVerifiedSessionToken(token);
                Cookies.set('userData', JSON.stringify(data.user), { expires: 1 / 24 });
            } catch (error: unknown) {
                if (cancelled) return;
                const cookieToken = Cookies.get('token') || null;
                if (cookieToken !== token) { updateToken(cookieToken); return; }
                setIsCheckingSession(false);
                if (axios.isAxiosError(error) && error.response?.status === 401) { clearLocalSession(); return; }
                if (axios.isAxiosError(error) && error.response?.status === 403) {
                    setUser(null);
                    setVerifiedToken(null);
                    setStatus('forbidden');
                    return;
                }
                setSessionError('Не удалось проверить сессию. Проверьте соединение.');
                setStatus((currentStatus) => {
                    if (currentStatus === 'authenticated') return currentStatus;
                    return 'error';
                });
            }
        }
        checkSession();
        return () => { cancelled = true; };
    }, [token, checkVersion, clearLocalSession, updateToken]);

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
        <AuthContext.Provider value={{ user, token, setToken: updateToken, status: checkedStatus, isCheckingSession, sessionError, logout, retrySession }}>
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
