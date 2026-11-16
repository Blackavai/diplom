import { createContext, useContext } from 'react';

export type NotificationType = 'success' | 'error';
interface NotificationContextValue {
    addNotification: (type: NotificationType, message: string) => void;
}
export const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);
export function useNotification() {
    const context = useContext(NotificationContext);
    if (!context) throw new Error('useNotification must be used within a NotificationProvider');
    return context;
}
