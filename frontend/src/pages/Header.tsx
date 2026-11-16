import { useEffect, useState } from 'react';
import '../style/header.css';
import { NavLink } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from './auth-context';

function Header() {
    const { user, logout } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const isAdmin = user?.role === 1;

    useEffect(() => {
        const mobile = window.matchMedia('(max-width: 1024px)');
        const closeDesktopMenu = () => { if (!mobile.matches) setIsSidebarOpen(false); };
        mobile.addEventListener('change', closeDesktopMenu);
        return () => mobile.removeEventListener('change', closeDesktopMenu);
    }, []);

    function handleLogout() {
        void logout();
        setIsSidebarOpen(false);
    }

    const NavigationLinks = ({ onClick }: { onClick?: () => void }) => (
        <>
            <NavLink to="/users" onClick={onClick}>Сотрудники</NavLink>
            <NavLink to="/teams" onClick={onClick}>Команды</NavLink>
            <NavLink to="/tasks_list" onClick={onClick}>Задачи</NavLink>
            <NavLink to="/reports_list" onClick={onClick}>Отчёты</NavLink>
            <NavLink to="/vacation_list" onClick={onClick}>Отпуска</NavLink>
        </>
    );

    return (
        <Dialog open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
            <div className="mainBlock">
                <div className="adaptive mainBlockGrid">
                    <div className="border_block item_logo">
                        <NavLink to={isAdmin ? '/users' : '/tasks'}>
                            <img src="/logo_itk.png" alt="ИТК" />
                        </NavLink>
                    </div>
                    <nav className="border_block item_nav" aria-label="Основная навигация">
                        {isAdmin && <NavigationLinks />}
                    </nav>
                    <div className="border_block item_auth">
                        {user && <>
                            <span title={user.fname + ' ' + user.lname}>{user.fname} {user.lname}</span>
                            <NavLink className="password-link" to="/change-password">Сменить пароль</NavLink>
                            <button type="button" aria-label="Выйти" className="logout-button btnInteractive" onClick={handleLogout}>
                                <img src="/exitButton.png" alt="Выход" />
                            </button>
                        </>}
                    </div>
                    <DialogTrigger asChild>
                        <button type="button" className="sideBarHeader" aria-label="Открыть меню">
                            <img src="/sidebar_menu.png" alt="" />
                        </button>
                    </DialogTrigger>
                </div>
            </div>
            <DialogContent className="sidebar">
                <DialogTitle className="sr-only">Навигация</DialogTitle>
                <nav aria-label="Мобильная навигация">
                    {isAdmin && <NavigationLinks onClick={() => setIsSidebarOpen(false)} />}
                </nav>
                {user && <div className="item_auth_sidebar">
                    <span>{user.fname} {user.lname}</span>
                    <NavLink className="password-link" to="/change-password" onClick={() => setIsSidebarOpen(false)}>Сменить пароль</NavLink>
                    <button type="button" aria-label="Выйти" className="logout-button btnInteractive" onClick={handleLogout}>
                        <img src="/exitButton.png" alt="Выход" />
                    </button>
                </div>}
            </DialogContent>
        </Dialog>
    );
}

export default Header;
