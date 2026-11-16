import { useRef, useState } from 'react';
import axios from 'axios';
import { publicApi } from '@/lib/api';
import { useAuth } from './auth-context';
import '../style/login.css';
import { useNavigate } from 'react-router-dom';
import { useNotification } from './notification-context';

function errorMessage(error: unknown, fallback: string) {
    if (axios.isAxiosError<{ message?: string }>(error) && typeof error.response?.data?.message === 'string') {
        return error.response.data.message;
    }
    return fallback;
}

export default function LoginPage() {
    const { completeLogin } = useAuth();
    const [tg_id, setTgId] = useState('');
    const [password, setPassword] = useState('');
    const [isRecoveryMode, setIsRecoveryMode] = useState(false);
    const [loginPending, setLoginPending] = useState(false);
    const loginBusy = useRef(false);
    const navigate = useNavigate();
    const { addNotification } = useNotification();

    async function authFunc() {
        if (loginBusy.current) return;
        loginBusy.current = true;
        setLoginPending(true);
        try {
            const response = await publicApi.post('/auth/login', { tg_id, password }, { withCredentials: true, timeout: 15000 });
            completeLogin();
            addNotification('success', 'Вы вошли в систему');
            if (response.data.user.role === 1) navigate('/users');
            if (response.data.user.role === 2) navigate('/tasks');
        } catch (error) {
            addNotification('error', errorMessage(error, 'Не удалось войти. Проверьте соединение.'));
        } finally {
            loginBusy.current = false;
            setLoginPending(false);
        }
    }

    return <div className="mainBlockLogin">
        <div className="loginMainBlock">
            <div className="logoLogin"><img src="/logo_itk.png" alt="ИТК" width="100" /></div>
            {isRecoveryMode ? <div className="inputLogin">
                <p role="status">Для восстановления доступа обратитесь к менеджеру. Он задаст новый пароль и передаст его вам лично.</p>
                <button type="button" className="btnInteractive" onClick={() => setIsRecoveryMode(false)}>Назад</button>
            </div> : <div className="inputLogin">
                <input type="text" name="tg_input" autoComplete="username" aria-label="Логин" disabled={loginPending}
                    value={tg_id} onChange={(event) => setTgId(event.target.value)} placeholder="Логин" />
                <input type="password" name="pass_input" autoComplete="current-password" aria-label="Пароль" disabled={loginPending}
                    value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Пароль" />
                <button type="button" disabled={loginPending} onClick={authFunc} className="btnInteractive">{loginPending ? 'Вход…' : 'Войти'}</button>
                <button type="button" disabled={loginPending} onClick={() => setIsRecoveryMode(true)} className="recovery-link">Восстановление пароля</button>
            </div>}
        </div>
    </div>;
}
