import { Route, Routes } from 'react-router-dom';
import './App.css';
import Header from './pages/Header.tsx';
import User from './pages/users.tsx';
import LoginPage from './pages/LoginPage.tsx';
import Teams from './pages/Teams.tsx';
import TasksList from './pages/TasksList.tsx';
import ReportsList from './pages/ReportsList.tsx';
import VacationList from './pages/VacationList.tsx';
import AuthRedirect from './pages/AuthRedirect.tsx';
import TasksEmploye from './pages/TasksEmploye.tsx';
import pages from './assets/404_not_found.png';
import { Toaster } from 'sonner';
import { NotificationProvider } from './pages/Notification.tsx';
const App = () => {
    return (
        <>
            <NotificationProvider>
            <Toaster />
            <Header />
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<AuthRedirect />}>
                    <Route path="/users" element={<User />} />
                    <Route path="/teams" element={<Teams />} />
                    <Route path="/tasks_list" element={<TasksList />} />
                    <Route path="/reports_list" element={<ReportsList />} />
                    <Route path="/vacation_list" element={<VacationList />} />
                    <Route path="/tasks" element={<TasksEmploye />} />
                </Route>
                <Route path="*" element={
                    <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                        <img src={pages} alt="Описание изображения" width={"1000"}/>
                    </div>
                }/>
            </Routes>
            </NotificationProvider>
        </>
    );
}

export default App;
