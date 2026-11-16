import { useAuth } from './auth-context';
import ChangePasswordForm from './ChangePasswordForm';

export default function SettingsPage() {
    const { user } = useAuth();
    if (!user) return null;

    const roleName = user.role === 1 ? 'Менеджер' : 'Работник';

    return <main className="password-page settings-page">
        <h1>Личные настройки</h1>
        <section aria-labelledby="settings-profile-title">
            <h2 id="settings-profile-title">Мои данные</h2>
            <dl className="settings-profile">
                <div><dt>Имя</dt><dd>{user.fname}</dd></div>
                <div><dt>Фамилия</dt><dd>{user.lname}</dd></div>
                <div><dt>Логин / Telegram ID</dt><dd>{user.tg_id}</dd></div>
                <div><dt>Должность</dt><dd>{user.post}</dd></div>
                <div><dt>Роль</dt><dd>{roleName}</dd></div>
            </dl>
        </section>
        <section className="settings-password" aria-labelledby="settings-password-title">
            <h2 id="settings-password-title">Смена пароля</h2>
            <p>После смены потребуется повторный вход на всех устройствах.</p>
            <ChangePasswordForm />
        </section>
    </main>;
}
