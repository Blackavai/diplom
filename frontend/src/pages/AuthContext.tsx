import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Cookies from 'js-cookie';
import axios from 'axios';
import { toast } from 'sonner';
import { publicApi, onUnauthorized, getSessionGeneration, invalidateSession, setVerifiedSession } from '@/lib/api';
import type { SessionProof } from '@/lib/api';
import { createRequestKey } from '@/lib/requestKey';

import { AuthContext } from './auth-context';
import type { AuthUser, SessionStatus } from './auth-context';

interface SessionResponse extends SessionProof { user: AuthUser }

const EVENT_KEY = 'dailysync.session-event';
function locallySignedOut() {
    try { return localStorage.getItem(EVENT_KEY)?.startsWith('out:') || false; }
    catch { return false; }
}
function publishSessionEvent(kind: 'in' | 'out') {
    // Это уведомление вкладкам, не токен и не доказательство авторизации.
    try { localStorage.setItem(EVENT_KEY, kind + ':' + createRequestKey()); } catch { /* хранилище может быть отключено */ }
}
function validSession(data: SessionResponse) {
    return data.user && Number.isInteger(data.user.id) && [1, 2].includes(data.user.role) &&
        /^[a-f0-9]{32}$/.test(data.sessionId) && /^[a-f0-9]{64}$/.test(data.csrfToken);
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [status, setStatus] = useState<SessionStatus>(locallySignedOut() ? 'anonymous' : 'checking');
    const [checkVersion, setCheckVersion] = useState(0);
    const [isCheckingSession, setIsCheckingSession] = useState(!locallySignedOut());
    const [sessionError, setSessionError] = useState<string | null>(null);
    const lastProof = useRef<SessionProof | null>(null);

    const clearLocalSession = useCallback(() => {
        invalidateSession();
        lastProof.current = null;
        for (const name of ['token', 'userData', 'tokenExpiration']) Cookies.remove(name);
        publishSessionEvent('out');
        setUser(null);
        setStatus('anonymous');
        setIsCheckingSession(false);
        setSessionError(null);
        setCheckVersion((value) => value + 1);
    }, []);
    const retrySession = useCallback(() => {
        invalidateSession();
        setIsCheckingSession(true);
        setSessionError(null);
        setStatus((current) => current === 'authenticated' ? current : 'checking');
        setCheckVersion((value) => value + 1);
    }, []);
    const completeLogin = useCallback(() => {
        lastProof.current = null;
        setUser(null);
        publishSessionEvent('in');
        retrySession();
    }, [retrySession]);

    const logout = useCallback(async () => {
        let proof = lastProof.current;
        clearLocalSession();
        const outgoingGeneration = getSessionGeneration();
        try {
            if (!proof) {
                const { data } = await publicApi.get<SessionResponse>('/auth/protected', { timeout: 15000 });
                if (!validSession(data)) throw new Error('Invalid session response');
                proof = data;
            }
            if (outgoingGeneration !== getSessionGeneration()) return;
            await publicApi.post('/auth/logout', {}, { timeout: 15000,
                headers: { 'X-Session-Id': proof.sessionId, 'X-CSRF-Token': proof.csrfToken } });
            if (outgoingGeneration === getSessionGeneration()) toast.success('Все сессии завершены');
        } catch (error: unknown) {
            if (outgoingGeneration !== getSessionGeneration()) return;
            if (axios.isAxiosError(error) && error.response?.status === 401) toast.success('Сессия уже завершена');
            else toast.error('Вы вышли на этом устройстве. Серверный отзыв сессий не подтверждён.');
        }
    }, [clearLocalSession]);

    useEffect(() => onUnauthorized(clearLocalSession), [clearLocalSession]);
    useEffect(() => {
        if (locallySignedOut()) return;
        let cancelled = false;
        const expectedGeneration = getSessionGeneration();
        async function checkSession() {
            try {
                const { data } = await publicApi.get<SessionResponse>('/auth/protected', { timeout: 15000 });
                if (cancelled || expectedGeneration !== getSessionGeneration()) return;
                if (!validSession(data)) throw new Error('Некорректный ответ проверки сессии');
                const proof = { sessionId: data.sessionId, csrfToken: data.csrfToken };
                lastProof.current = proof;
                setVerifiedSession(proof);
                setUser(data.user);
                setStatus('authenticated');
                setIsCheckingSession(false);
                setSessionError(null);
            } catch (error: unknown) {
                if (cancelled || expectedGeneration !== getSessionGeneration()) return;
                setIsCheckingSession(false);
                if (axios.isAxiosError(error) && error.response?.status === 401) { clearLocalSession(); return; }
                if (axios.isAxiosError(error) && error.response?.status === 403) {
                    setUser(null);
                    lastProof.current = null;
                    setStatus('forbidden');
                    return;
                }
                setSessionError('Не удалось проверить сессию. Проверьте соединение.');
                setStatus((current) => current === 'authenticated' ? current : 'error');
            }
        }
        checkSession();
        return () => { cancelled = true; };
    }, [checkVersion, clearLocalSession]);

    useEffect(() => {
        const onFocus = () => { if (!locallySignedOut()) retrySession(); };
        const onStorage = (event: StorageEvent) => {
            if (event.key !== EVENT_KEY) return;
            if (event.newValue?.startsWith('out:')) {
                // Не публикуем событие снова, чтобы вкладки не зациклились.
                invalidateSession();
                lastProof.current = null;
                setUser(null);
                setStatus('anonymous');
                setSessionError(null);
                setIsCheckingSession(false);
                setCheckVersion((value) => value + 1);
            } else {
                lastProof.current = null;
                setUser(null);
                retrySession();
            }
        };
        window.addEventListener('focus', onFocus);
        window.addEventListener('storage', onStorage);
        return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('storage', onStorage); };
    }, [retrySession]);

    return <AuthContext.Provider value={{ user, completeLogin, completePasswordChange: clearLocalSession, status, isCheckingSession, sessionError, logout, retrySession }}>{children}</AuthContext.Provider>;
};

