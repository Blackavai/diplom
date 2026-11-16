import { Link, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './auth-context';
const AuthRedirect = ({ roles }: { roles?: number[] }) => {
    const { user, status, isCheckingSession, sessionError, logout, retrySession } = useAuth();
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
    return (
        <>
            {!roles && isCheckingSession && <p role="status">Проверка сессии… Отправка изменений временно недоступна.</p>}
            {!roles && sessionError && (
                <div role="alert">
                    <p>{sessionError} Отправка изменений временно недоступна.</p>
                    <button className="btnInteractive" onClick={retrySession}>Повторить</button>
                    <button className="btnInteractive" onClick={logout}>Выйти</button>
                </div>
            )}
            <Outlet key={user.id} />
        </>
    );
};

export default AuthRedirect;
