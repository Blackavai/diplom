import React, { createContext, useContext } from 'react';
import { toast } from 'sonner';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
    const addNotification = (type, message) => {
        if (type === 'success') {
            toast.success(message);
        } else if (type === 'error') {
            toast.error(message);
        }
    };

    return (
        <NotificationContext.Provider value={{ addNotification }}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotification = () => {
    return useContext(NotificationContext);
};
