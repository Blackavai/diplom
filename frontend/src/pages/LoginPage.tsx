import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext.tsx';
import '../style/login.css';
import Cookies from 'js-cookie';
import { useNavigate } from 'react-router-dom';
import { useNotification } from './Notification.tsx';

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
            console.log('Ошибка авторизации', error.response ? error.response.data : error.message);
            addNotification('error', error.response.data.message);
        }
    };

    const handleRecovery = async () => {
        try {
            const response = await axios.post('http://localhost:5001/api/auth/recPass', { tg_id: recoveryTgId });
            if (response.data) {
                setSecurityQuestion(response.data.recoverPassword.questions);
                setIsQuestionVisible(true);
            } else {
                addNotification('error', 'Логин не найден');
            }
        } catch (error) {
            console.log('Ошибка восстановления пароля', error.response ? error.response.data : error.message);
            addNotification('error', 'Ошибка восстановления пароля');
        }
    };

    const handleAnswerSubmit = async () => {
        try {
            const response = await axios.post('http://localhost:5001/api/auth/recAns', { tg_id: recoveryTgId, secAns: securityAnswer });
            if (response.data) {
                setIsAnswerCorrect(true); // Set answer correctness to true
                setIsQuestionVisible(false); // Hide the question input
                setRecoverInput(false);
            } else {
                addNotification('error', 'Неверный ответ на вопрос');
            }
        } catch (error) {
            console.log('Ошибка проверки ответа', error.response ? error.response.data : error.message);
            addNotification('error', 'Ошибка проверки ответа');
        }
    };

    const handlePasswordReset = async () => {
        if (newPassword !== confirmPassword) {
            addNotification('error', 'Пароли не совпадают');
            return;
        }

        try {
            const response = await axios.post('http://localhost:5001/api/auth/recPass/newPass', { tg_id: recoveryTgId, textNewPassword: newPassword });
            if (response.data.success) {
                addNotification('success', 'Пароль успешно изменен');
                navigate('/login'); // Redirect to login page
                handleBack();
            } else {
                addNotification('error', 'Ошибка при изменении пароля');
                console.log('Ошибка сброса пароля', error.response ? error.response.data : error.message);
            }
        } catch (error) {
            console.log('Ошибка сброса пароля', error.response ? error.response.data : error.message);
            addNotification('error', 'Ошибка сброса пароля');
        }
    };

    const handleBack = () => {
        setIsRecoveryMode(false);
        setRecoverInput(false);
        setRecoveryTgId('');
        setSecurityQuestion('');
        setSecurityAnswer('');
        setIsQuestionVisible(false);
        setNewPassword('');
        setConfirmPassword('');
        setIsAnswerCorrect(false);
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
                                    onChange={(e) => setRecoveryTgId(e.target.value)}
                                    placeholder={'Введите логин'}
                                />

                                <button onClick={handleRecovery} className={'btnInteractive'}>Восстановить</button>
                                <p onClick={handleBack} style={{ cursor: 'pointer' }}>Назад</p>
                            </>
                        )}
                        {isQuestionVisible &&(
                            <>
                                <p>Проверочный вопрос: {securityQuestion}</p>
                                <input
                                    type={'text'}
                                    value={securityAnswer}
                                    onChange={(e) => setSecurityAnswer(e.target.value)}
                                    placeholder={'Ответ'}
                                />

                                <button className={'btnInteractive'} onClick={handleAnswerSubmit}>Подтвердить</button>
                            </>
                        )}
                        {isAnswerCorrect && (
                            <>
                                <input
                                    type={'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder={'Новый пароль'}
                                />

                                <input
                                    type={'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder={'Подтверждение пароля'}
                                />
                                <button className={'btnInteractive'} onClick={handlePasswordReset}>Сбросить пароль</button>
                            </>
                        )}
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