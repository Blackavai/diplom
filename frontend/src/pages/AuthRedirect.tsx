import React, { useEffect } from 'react';
import { useAuth } from './AuthContext.tsx';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import { Outlet } from 'react-router-dom';

interface AuthRedirectProps {
    children: React.ReactNode;
}

const AuthRedirect: React.FC<AuthRedirectProps> = ({ children }) => {
    const { token, setUser, setToken } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        // Проверка наличия токена при первом рендере
        if (!token) {
            setUser(null);
            setToken(null);
            navigate('/login');
        }

        // Таймер для проверки токена каждые 60 секунд
        const interval = setInterval(() => {
            const currentToken = Cookies.get('token');
            if (!currentToken) {
                setUser("");
                setToken(null);
                navigate('/login');
            }
        }, 3600000); // Проверка каждые 60 секунд

        return () => clearInterval(interval); // Очистка интервала при размонтировании компонента
    }, [token, navigate, setUser, setToken]);

    return <>{children || <Outlet />}</>;
};

export default AuthRedirect;
