import ChangePasswordForm from './ChangePasswordForm';

export default function ChangePasswordPage() {
    return <main className="password-page">
        <h1>Смена пароля</h1>
        <p>После смены потребуется повторный вход на всех устройствах.</p>
        <ChangePasswordForm />
    </main>;
}
