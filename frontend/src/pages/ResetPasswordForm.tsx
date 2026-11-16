import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import api, { apiResponseMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from './auth-context';
import { useNotification } from './notification-context';

interface ResetPasswordFormProps {
    userId: number;
    onPendingChange: (pending: boolean) => void;
    onCancel: () => void;
    onSuccess: () => void;
}

export default function ResetPasswordForm({ userId, onPendingChange, onCancel, onSuccess }: ResetPasswordFormProps) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [unknownResult, setUnknownResult] = useState(false);
    const busy = useRef(false);
    const active = useRef(true);
    const { isCheckingSession, sessionError } = useAuth();
    const { addNotification } = useNotification();
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy.current || isCheckingSession || sessionError || unknownResult) return;
        setError(null);
        if (!currentPassword.trim() || !newPassword.trim() || newPassword !== confirmPassword) {
            setError('Введите свой пароль и новый пароль сотрудника с совпадающим подтверждением.');
            return;
        }
        busy.current = true; setPending(true); onPendingChange(true);
        try {
            const { data } = await api.post<{ success: boolean }>(`/auth/users/${userId}/reset-password`, {
                currentPassword, newPassword, confirmPassword
            }, { timeout: 15000 });
            if (!active.current) return;
            if (data?.success !== true) throw new Error('Сброс пароля не подтверждён');
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
            addNotification('success', 'Новый пароль установлен. Передайте заданный пароль сотруднику лично.');
            onSuccess();
        } catch (failure: unknown) {
            if (!active.current) return;
            const uncertainResult = axios.isAxiosError(failure)
                ? !failure.response || failure.response.status >= 500
                : failure instanceof Error && failure.message === 'Сброс пароля не подтверждён';
            if (uncertainResult) {
                setUnknownResult(true);
                setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
                setError('Сброс мог выполниться, но подтверждение не получено. Проверьте вход сотрудника с новым паролем перед повторным сбросом.');
            } else {
                setError(apiResponseMessage(failure, 'Не удалось сбросить пароль.'));
            }
        } finally {
            busy.current = false;
            if (active.current) { setPending(false); onPendingChange(false); }
        }
    }

    return <form className="password-form" onSubmit={submit}>
        <h2>Новый пароль сотрудника</h2>
        <p>Прежний пароль перестанет действовать, открытые сессии сотрудника завершатся.</p>
        <label>Ваш пароль менеджера<input type="password" autoComplete="current-password" required
            disabled={pending || unknownResult} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
        <label>Новый пароль сотрудника<input type="password" autoComplete="new-password" required
            disabled={pending || unknownResult} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
        <label>Подтверждение пароля сотрудника<input type="password" autoComplete="new-password" required
            disabled={pending || unknownResult} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
        {error && <p role="alert">{error}</p>}
        <div className="password-actions">
            <Button type="submit" disabled={pending || unknownResult || isCheckingSession || Boolean(sessionError)}>{pending ? 'Сохранение…' : 'Установить новый пароль'}</Button>
            <Button type="button" disabled={pending} onClick={onCancel}>Назад</Button>
        </div>
    </form>;
}
