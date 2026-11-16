import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { NotificationContext } from './notification-context';
import type { NotificationType } from './notification-context';

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
    const addNotification = (type: NotificationType, message: string) => {
        if (type === 'success') toast.success(message);
        else toast.error(message);
    };
    return <NotificationContext.Provider value={{ addNotification }}>{children}</NotificationContext.Provider>;
};
