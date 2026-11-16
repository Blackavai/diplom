import { createContext, useContext } from 'react';

export interface AuthUser {
    id: number;
    fname: string;
    lname: string;
    tg_id: string;
    post: string;
    role: number;
    passwordChangeRecommended?: boolean;
}
export type SessionStatus = 'checking' | 'authenticated' | 'anonymous' | 'error' | 'forbidden';
interface AuthContextValue {
    user: AuthUser | null;
    completeLogin: () => void;
    completePasswordChange: () => void;
    status: SessionStatus;
    isCheckingSession: boolean;
    sessionError: string | null;
    logout: () => Promise<void>;
    retrySession: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
}
