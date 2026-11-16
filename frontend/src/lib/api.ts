import axios from 'axios';
import { toast } from 'sonner';

export interface SessionProof {
    sessionId: string;
    csrfToken: string;
}

const baseURL = '/api';
const options = { baseURL, withCredentials: true, headers: { 'X-Requested-With': 'XMLHttpRequest' } };
const api = axios.create(options);
export const publicApi = axios.create(options);
const unauthorizedHandlers = new Set<() => void>();
const requestGenerations = new WeakMap<object, number>();
let generation = 0;
let verifiedSession: SessionProof | null = null;

export const getSessionGeneration = () => generation;
export function invalidateSession() {
    generation++;
    verifiedSession = null;
}
export function setVerifiedSession(session: SessionProof) {
    verifiedSession = session;
}
export const onUnauthorized = (handler: () => void) => {
    unauthorizedHandlers.add(handler);
    return () => { unauthorizedHandlers.delete(handler); };
};

api.interceptors.request.use((config) => {
    const method = config.method?.toUpperCase() || 'GET';
    const changesData = !['GET', 'HEAD', 'OPTIONS'].includes(method) || config.url?.startsWith('/users/delete/');
    if (config.headers.has('Authorization') || (changesData && !verifiedSession)) {
        throw new Error('Дождитесь успешной проверки сессии и повторите действие');
    }
    if (verifiedSession) {
        config.headers.set('X-Session-Id', verifiedSession.sessionId);
        if (changesData) config.headers.set('X-CSRF-Token', verifiedSession.csrfToken);
    }
    requestGenerations.set(config, generation);
    return config;
});

api.interceptors.response.use((response) => response, (error: unknown) => {
    if (axios.isAxiosError(error) && error.config && requestGenerations.get(error.config) === generation) {
        if (error.response?.status === 401) for (const handler of unauthorizedHandlers) handler();
        const passwordRequest = error.config.url === '/auth/change-password' ||
            /^\/auth\/users\/[1-9]\d*\/reset-password$/.test(error.config.url || '');
        if (error.response?.status === 403 && !passwordRequest) toast.error('Недостаточно прав или требуется повторная проверка сессии', { id: 'api-forbidden' });
    }
    return Promise.reject(error);
});

export const apiErrorMessage = (error: unknown) =>
    axios.isAxiosError(error) && error.response ? `HTTP ${error.response.status}` : 'Ошибка запроса или соединения';

export function apiResponseMessage(error: unknown, fallback: string): string {
    if (axios.isAxiosError<{ message?: unknown; error?: unknown }>(error)) {
        const message = error.response?.data?.message || error.response?.data?.error;
        if (typeof message === 'string') return message;
    }
    return fallback;
}

export default api;
