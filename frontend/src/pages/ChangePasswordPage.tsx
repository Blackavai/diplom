import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import api, { apiResponseMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from './auth-context';
import { useNotification } from './notification-context';

export default function ChangePasswordPage() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [unknownResult, setUnknownResult] = useState(false);
    const busy = useRef(false);
    const active = useRef(true);
    const { completePasswordChange, isCheckingSession, sessionError, user } = useAuth();
    const { addNotification } = useNotification();
    const navigate = useNavigate();
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

    function returnToLogin() {
        // Не отправляем logout: успешная смена уже отозвала все прежние сессии.
        completePasswordChange();
        navigate('/login', { replace: true });
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy.current || isCheckingSession || sessionError || unknownResult) return;
        setError(null);
        if (!currentPassword.trim() || !newPassword.trim() || newPassword !== confirmPassword) {
            setError('Заполните пароли и проверьте совпадение нового пароля с подтверждением.');
            return;
        }
        if (newPassword === currentPassword) {
            setError('Новый пароль должен отличаться от текущего.');
            return;
        }
        busy.current = true;
        setPending(true);
        try {
            const { data } = await api.post<{ success: boolean }>('/auth/change-password', {
                currentPassword, newPassword, confirmPassword
            }, { timeout: 15000 });
            if (!active.current) return;
            if (data?.success !== true) throw new Error('Смена пароля не подтверждена');
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
            addNotification('success', 'Пароль изменён. Войдите с новым паролем.');
            returnToLogin();
        } catch (failure: unknown) {
            if (!active.current) return;
            const uncertainResult = axios.isAxiosError(failure)
                ? !failure.response || failure.response.status >= 500
                : failure instanceof Error && failure.message === 'Смена пароля не подтверждена';
            if (uncertainResult) {
                setUnknownResult(true);
                setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
                setError('Результат смены не подтверждён. Перейдите ко входу и попробуйте новый пароль. Если он не подходит, используйте прежний.');
            } else {
                setError(apiResponseMessage(failure, 'Не удалось сменить пароль.'));
            }
        } finally {
            busy.current = false;
            if (active.current) setPending(false);
        }
    }

    return <main className="password-page">
        <h1>Смена пароля</h1>
        <p>После смены потребуется повторный вход на всех устройствах.</p>
        <form className="password-form" onSubmit={submit}>
            <label>Текущий пароль<input type="password" autoComplete="current-password" required
                disabled={pending || unknownResult} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
            <label>Новый пароль<input type="password" autoComplete="new-password" required
                disabled={pending || unknownResult} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
            <label>Подтверждение нового пароля<input type="password" autoComplete="new-password" required
                disabled={pending || unknownResult} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
            {error && <p role="alert">{error}</p>}
            <div className="password-actions">
                {unknownResult ? <Button type="button" onClick={returnToLogin}>Перейти ко входу</Button>
                    : <Button type="submit" disabled={pending || isCheckingSession || Boolean(sessionError)}>{pending ? 'Сохранение…' : 'Сменить пароль'}</Button>}
                <Button type="button" disabled={pending} onClick={() => navigate(user?.role === 1 ? '/users' : '/tasks')}>Вернуться к работе</Button>
            </div>
        </form>
    </main>;
}
