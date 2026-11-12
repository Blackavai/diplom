import React, { useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext.tsx';
import '../style/login.css';
import Cookies from 'js-cookie';
import { useNavigate } from 'react-router-dom';
import { useNotification } from './Notification.tsx';

const errorMessage = (error: unknown, fallback: string) => {
    if (axios.isAxiosError<{ message?: string }>(error) && typeof error.response?.data?.message === 'string') {
        return error.response.data.message;
    }
    return fallback;
};

const LoginPage: React.FC = () => {
    const { setUser, setToken } = useAuth();
    const [tg_id, setTgId] = useState('');
    const [password, setPassword] = useState('');
    const [isRecoveryMode, setIsRecoveryMode] = useState(false);
    const [recoverInput, setRecoverInput] = useState(false);
    const [recoveryTgId, setRecoveryTgId] = useState('');
    const [securityQuestion, setSecurityQuestion] = useState('');
    const [securityAnswer, setSecurityAnswer] = useState('');
    const [isQuestionVisible, setIsQuestionVisible] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isAnswerCorrect, setIsAnswerCorrect] = useState(false);
    const [recoveryToken, setRecoveryToken] = useState('');
    const [recoveryPending, setRecoveryPending] = useState(false);
    const recoveryBusy = useRef(false);
    const navigate = useNavigate();
    const { addNotification } = useNotification();

    const authFunc = async () => {
        try {
            const response = await axios.post('http://localhost:5001/api/auth/login', { tg_id, password }, { withCredentials: true });
            const token = response.data.user.token;

            if (!token) {
                throw new Error("Токен не получен");
            }

            setUser(response.data.user);
            setToken(token);
            Cookies.set('token', token);
            Cookies.set('userData', JSON.stringify(response.data.user));
            addNotification('success', 'Вы вошли в систему');
            if(response.data.user.role == 1) {
                navigate('/users');
            }
            if(response.data.user.role == 2) {
                navigate('/tasks');
            }
        } catch (error) {
            addNotification('error', errorMessage(error, 'Не удалось войти. Проверьте соединение.'));
        }
    };

    const runRecoveryRequest = async (request: () => Promise<void>) => {
        if (recoveryBusy.current) return;
        recoveryBusy.current = true;
        setRecoveryPending(true);
        try {
            await request();
        } finally {
            recoveryBusy.current = false;
            setRecoveryPending(false);
        }
    };

    const clearRecoveryProgress = () => {
        setSecurityQuestion('');
        setSecurityAnswer('');
        setIsQuestionVisible(false);
        setNewPassword('');
        setConfirmPassword('');
        setIsAnswerCorrect(false);
        setRecoveryToken('');
    };

    const handleRecovery = () => runRecoveryRequest(async () => {
        clearRecoveryProgress();
        if (!recoveryTgId.trim()) {
            addNotification('error', 'Введите логин');
            return;
        }
        try {
            const response = await axios.post('http://localhost:5001/api/auth/recPass', { tg_id: recoveryTgId }, { timeout: 15000 });
            const question = response.data?.recoverPassword?.questions;
            if (typeof question !== 'string' || !question.trim()) throw new Error('Вопрос не получен');
            setSecurityQuestion(question);
            setIsQuestionVisible(true);
            setRecoverInput(false);
        } catch (error) {
            addNotification('error', errorMessage(error, 'Не удалось получить вопрос. Попробуйте снова.'));
        }
    });

    const handleAnswerSubmit = () => runRecoveryRequest(async () => {
        if (!securityAnswer.trim()) {
            addNotification('error', 'Введите ответ на проверочный вопрос');
            return;
        }
        try {
            const response = await axios.post('http://localhost:5001/api/auth/recAns', { tg_id: recoveryTgId, secAns: securityAnswer }, { timeout: 15000 });
            const token = response.data?.recoveryToken;
            if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Разрешение не получено');
            setRecoveryToken(token);
            setSecurityAnswer('');
            setIsAnswerCorrect(true);
            setIsQuestionVisible(false);
            setRecoverInput(false);
        } catch (error) {
            addNotification('error', errorMessage(error, 'Не удалось проверить ответ. Попробуйте снова.'));
        }
    });

    const handlePasswordReset = () => runRecoveryRequest(async () => {
        if (!newPassword.trim() || newPassword.length > 1024) {
            addNotification('error', 'Введите пароль длиной до 1024 символов');
            return;
        }
        if (newPassword !== confirmPassword) {
            addNotification('error', 'Пароли не совпадают');
            return;
        }

        try {
            const response = await axios.post('http://localhost:5001/api/auth/recPass/newPass', {
                tg_id: recoveryTgId, textNewPassword: newPassword, recoveryToken
            }, { timeout: 15000 });
            if (response.data.success) {
                addNotification('success', 'Пароль успешно изменен');
                clearRecoveryProgress();
                setRecoveryTgId('');
                setIsRecoveryMode(false);
                setRecoverInput(false);
                navigate('/login');
            } else {
                throw new Error('Смена пароля не подтверждена');
            }
        } catch (error) {
            // A network/SQL failure may happen after the one-time grant was consumed.
            clearRecoveryProgress();
            setRecoverInput(true);
            addNotification('error', errorMessage(error, 'Смена пароля не подтверждена. Начните восстановление заново.'));
        }
    });

    const handleBack = () => {
        if (recoveryBusy.current) return;
        setIsRecoveryMode(false);
        setRecoverInput(false);
        setRecoveryTgId('');
        clearRecoveryProgress();
    };

    return (
        <div className={'mainBlockLogin'}>
            <div className={'loginMainBlock'}>
                <div className={'logoLogin'}>
                    <img src={'../../logo_itk.png'} alt={'itk'} width={'100'} />
                </div>
                {isRecoveryMode ? (
                    <div className={'inputLogin'}>
                        {recoverInput && (
                            <>
                                <input
                                    type={'text'}
                                    value={recoveryTgId}
                                    disabled={recoveryPending}
                                    maxLength={255}
                                    onChange={(e) => { setRecoveryTgId(e.target.value); clearRecoveryProgress(); }}
                                    placeholder={'Введите логин'}
                                />

                                <button disabled={recoveryPending} onClick={handleRecovery} className={'btnInteractive'}>{recoveryPending ? 'Подождите…' : 'Восстановить'}</button>
                            </>
                        )}
                        {isQuestionVisible &&(
                            <>
                                <p>Проверочный вопрос: {securityQuestion}</p>
                                <input
                                    type={'text'}
                                    value={securityAnswer}
                                    disabled={recoveryPending}
                                    maxLength={255}
                                    onChange={(e) => setSecurityAnswer(e.target.value)}
                                    placeholder={'Ответ'}
                                />

                                <button disabled={recoveryPending} className={'btnInteractive'} onClick={handleAnswerSubmit}>{recoveryPending ? 'Подождите…' : 'Подтвердить'}</button>
                            </>
                        )}
                        {isAnswerCorrect && (
                            <>
                                <input
                                    type={'password'}
                                    value={newPassword}
                                    disabled={recoveryPending}
                                    maxLength={1024}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder={'Новый пароль'}
                                />

                                <input
                                    type={'password'}
                                    value={confirmPassword}
                                    disabled={recoveryPending}
                                    maxLength={1024}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder={'Подтверждение пароля'}
                                />
                                <button disabled={recoveryPending} className={'btnInteractive'} onClick={handlePasswordReset}>{recoveryPending ? 'Подождите…' : 'Сбросить пароль'}</button>
                            </>
                        )}
                        <p onClick={handleBack} style={{ cursor: 'pointer' }}>Назад</p>
                    </div>
                ) : (
                    <div className={'inputLogin'}>
                        <input
                            type={'text'}
                            name={'tg_input'}
                            onChange={(e) => setTgId(e.target.value)}
                            placeholder={'Логин'}
                        />

                        <input
                            type={'password'}
                            name={'pass_input'}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={'Пароль'}
                        />
                        <button onClick={authFunc} className={'btnInteractive'}>Войти</button>
                        <p onClick={() => { setIsRecoveryMode(true); setRecoverInput(true); }} style={{cursor: 'pointer'}}>Восстановление пароля</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default LoginPage;
