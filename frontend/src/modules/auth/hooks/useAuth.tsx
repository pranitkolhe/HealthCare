import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { setAccessToken as setApiAccessToken } from '../../../shared/lib/api';

type User = { id: string; email: string; role: string } | null;

type AuthContextValue = {
  user: User;
  token: string | null;
  setUser: (user: User) => void;
  setToken: (token: string | null) => void;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  setUser: () => {},
  setToken: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(() => {
    const stored = localStorage.getItem('authUser');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('accessToken'));

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

  useEffect(() => {
    const handleExpiredSession = () => {
      setUser(null);
      setToken(null);
    };
    window.addEventListener('auth:expired', handleExpiredSession);
    return () => window.removeEventListener('auth:expired', handleExpiredSession);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, setUser, setToken }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
