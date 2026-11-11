import React, { useState } from 'react';
import '../style/header.css';
import { NavLink } from 'react-router-dom';
import { useAuth } from './AuthContext.tsx';
import Cookies from 'js-cookie';
import { useNotification } from './Notification.tsx';

function Header() {
    const { user, setUser, setToken } = useAuth();
    const { addNotification } = useNotification();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Проверяем, является ли пользователь админом (роль 1)
    const isAdmin = user?.role === 1;

    const handleLogout = () => {
        setUser("");
        setToken(null);
        Cookies.remove('userData');
        Cookies.remove('token');
        Cookies.remove('tokenExpiration');
        addNotification('success', 'Вы вышли из системы');
        setIsSidebarOpen(false);
    };

    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen);
    };

    // Компонент навигации — переиспользуем в десктопе и сайдбаре
    const NavigationLinks = ({ onClick }: { onClick?: () => void }) => (
        <>
            <NavLink 
                to="/users" 
                className={({isActive}) => isActive ? "active" : undefined}
                onClick={onClick}
            >
                Сотрудники
            </NavLink>
            <NavLink 
                to="/teams" 
                className={({isActive}) => isActive ? "active" : undefined}
                onClick={onClick}
            >
                Команды
            </NavLink>
            <NavLink 
                to="/tasks_list" 
                className={({isActive}) => isActive ? "active" : undefined}
                onClick={onClick}
            >
                Задачи
            </NavLink>
            <NavLink 
                to="/reports_list" 
                className={({isActive}) => isActive ? "active" : undefined}
                onClick={onClick}
            >
                Отчёты
            </NavLink>
            <NavLink 
                to="/vacation_list" 
                className={({isActive}) => isActive ? "active" : undefined}
                onClick={onClick}
            >
                Отпуска
            </NavLink>
        </>
    );

    return (
        <div className={'mainBlock'}>
            <div className={'adaptive mainBlockGrid'}>
                <div className={'border_block item_logo'}>
                    <NavLink to="/users">
                        <img src={'../../logo_itk.png'} alt={'oggetto'}/>
                    </NavLink>
                </div>
                
                {/* Десктопная навигация — показываем только админам */}
                <div className={'border_block item_nav'}>
                    {isAdmin && <NavigationLinks />}
                </div>
                
                <div className={'border_block item_auth'}>
                    {user ? (
                        <>
                            <span>{user.fname} {user.lname}</span>
                            <img
                                src={'../../exitButton.png'}
                                alt="Выход"
                                style={{cursor: 'pointer'}}
                                onClick={handleLogout}
                                className={'btnInteractive'}
                            />
                        </>
                    ) : (
                        <></>
                    )}
                </div>

                <div className={'sideBarHeader'}>
                    <img
                        src={'../../sidebar_menu.png'}
                        onClick={toggleSidebar}
                        alt="Меню"
                    />
                </div>
            </div>

            {/* Мобильное меню — навигация только для админов */}
            <div className={`sidebar ${isSidebarOpen ? 'active' : ''}`}>
                <img
                    src={'../../close_sidebar.png'}
                    className="sidebar-close-icon"
                    onClick={toggleSidebar}
                />
                <div className={'sidebar_first_str'}></div>
                
                {isAdmin && <NavigationLinks onClick={toggleSidebar} />}
                
                <div className={'border_block item_auth_sidebar'}>
                    {user ? (
                        <>
                            <span>{user.fname} {user.lname}</span>
                            <img
                                src={'../../exitButton.png'}
                                alt="Выход"
                                style={{cursor: 'pointer'}}
                                onClick={handleLogout}
                                className={'btnInteractive'}
                            />
                        </>
                    ) : (
                        <></>
                    )}
                </div>
            </div>
            
            <div
                className={`overlay ${isSidebarOpen ? 'active' : ''}`}
                onClick={toggleSidebar}
            ></div>
        </div>
    );
}

export default Header;