
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setToken } from '../lib/api';
import { reconnectSocket } from '../lib/socket';

const AuthContext = createContext(null);

function readUser() {
  try {
    return JSON.parse(sessionStorage.getItem('pos_user'));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUser);

  const logout = useCallback(() => {
    sessionStorage.removeItem('pos_user');
    setToken(null);
    setUser(null);
    reconnectSocket();
  }, []);

  const login = useCallback(async (payload) => {
    const res = await api('/auth/login', { method: 'POST', body: payload });
    setToken(res.token);
    sessionStorage.setItem('pos_user', JSON.stringify(res.user));
    setUser(res.user);
    reconnectSocket();
    return res.user;
  }, []);

  useEffect(() => {
    window.addEventListener('pos:unauthorized', logout);
    return () => window.removeEventListener('pos:unauthorized', logout);
  }, [logout]);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
 