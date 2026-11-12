import { Link, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext.tsx';
const AuthRedirect = ({ roles }: { roles?: number[] }) => {
    const { user, status, logout, retrySession } = useAuth();
    if (status === 'anonymous') return <Navigate to="/login" replace />;
    if (status === 'checking') return <p role="status">Проверка сессии…</p>;
    if (status === 'error' || status === 'forbidden') return (
        <div role="alert">
            <p>{status === 'forbidden' ? 'Доступ запрещён' : 'Не удалось проверить сессию. Проверьте соединение.'}</p>
            <button className="btnInteractive" onClick={retrySession}>Повторить</button>
            <button className="btnInteractive" onClick={logout}>Выйти</button>
        </div>
    );
    if (!user || (roles && !roles.includes(user.role))) return (
        <div role="alert">
            <p>Недостаточно прав для этой страницы</p>
            <Link to={user?.role === 1 ? '/users' : '/tasks'}>Перейти к доступной странице</Link>
        </div>
    );
    return <Outlet />;
};

export default AuthRedirect;
