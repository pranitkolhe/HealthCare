import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { setAccessToken as setApiAccessToken } from '../../../shared/lib/api';
import api from '../../../shared/lib/api';

type User = { id: string; email: string; role: string } | null;

type AuthContextValue = {
  user: User;
  token: string | null;
  setUser: (user: User) => void;
  setToken: (token: string | null) => void;
  restoring: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  setUser: () => {},
  setToken: () => {},
  restoring: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(() => {
    const stored = localStorage.getItem('authUser');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('accessToken'));
  // A previously authenticated tab can render immediately from local storage;
  // refresh then happens quietly in the background.
  const [restoring, setRestoring] = useState(() => !localStorage.getItem('authUser'));

  useEffect(() => {
    if (user) {
      localStorage.setItem('authUser', JSON.stringify(user));
    } else {
      localStorage.removeItem('authUser');
    }
  }, [user]);

  useEffect(() => {
    if (token) {
      localStorage.setItem('accessToken', token);
    } else {
      localStorage.removeItem('accessToken');
    }
    setApiAccessToken(token);
  }, [token]);

  // The access token is short-lived; renew it from the 7-day httpOnly refresh
  // cookie whenever the app is opened again.
  useEffect(() => {
    void api.post('/auth/refresh').then((response) => {
      setToken(response.data.accessToken as string);
      setUser(response.data.user as User);
    }).catch(() => {
      setUser(null);
      setToken(null);
    }).finally(() => setRestoring(false));
  // Restore only once on application startup; token updates must not rotate it repeatedly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleExpiredSession = () => {
      setUser(null);
      setToken(null);
    };
    window.addEventListener('auth:expired', handleExpiredSession);
    return () => window.removeEventListener('auth:expired', handleExpiredSession);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, setUser, setToken, restoring }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
