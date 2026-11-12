import axios from 'axios';
import Cookies from 'js-cookie';
import { toast } from 'sonner';

// Vite and Nginx proxy this path to the backend in their respective environments.
const baseURL = '/api';
const api = axios.create({ baseURL });
export const publicApi = axios.create({ baseURL });
const unauthorizedHandlers = new Set<() => void>();

export const onUnauthorized = (handler: () => void) => {
    unauthorizedHandlers.add(handler);
    return () => { unauthorizedHandlers.delete(handler); };
};

api.interceptors.request.use((config) => {
    const token = Cookies.get('token');
    if (token && !config.headers.has('Authorization')) config.headers.set('Authorization', `Bearer ${token}`);
    return config;
});

api.interceptors.response.use((response) => response, (error: unknown) => {
    if (axios.isAxiosError(error)) {
        const currentToken = Cookies.get('token');
        const expectedHeader = currentToken ? `Bearer ${currentToken}` : undefined;
        const belongsToCurrentSession = error.config && error.config.headers.get('Authorization') === expectedHeader;
        if (belongsToCurrentSession && error.response?.status === 401) {
            for (const handler of unauthorizedHandlers) handler();
        }
        if (belongsToCurrentSession && error.response?.status === 403) {
            toast.error('Недостаточно прав для этого действия', { id: 'api-forbidden' });
        }
    }
    return Promise.reject(error);
});

// Axios errors contain request headers. Do not log them with the Bearer token.
export const apiErrorMessage = (error: unknown) =>
    axios.isAxiosError(error) && error.response ? `HTTP ${error.response.status}` : 'Ошибка запроса или соединения';

export default api;
