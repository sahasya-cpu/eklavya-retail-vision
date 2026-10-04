import { createContext, useContext, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('eklavya_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('eklavya_user');
    const storedStore = localStorage.getItem('eklavya_store');
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
      if (storedStore) setStore(JSON.parse(storedStore));
    }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function persistSession(nextUser, nextStore, nextToken) {
    localStorage.setItem('eklavya_token', nextToken);
    localStorage.setItem('eklavya_user', JSON.stringify(nextUser));
    if (nextStore) localStorage.setItem('eklavya_store', JSON.stringify(nextStore));
    setUser(nextUser);
    setStore(nextStore);
    setToken(nextToken);
  }

  async function login(email, password) {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      persistSession(data.user, data.store, data.token);
      return { success: true };
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }
  }

  async function register(name, email, password, storeName) {
    try {
      const { data } = await api.post('/auth/register', { name, email, password, store_name: storeName });
      persistSession(data.user, data.store, data.token);
      return { success: true };
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }
  }

  function logout() {
    localStorage.removeItem('eklavya_token');
    localStorage.removeItem('eklavya_user');
    localStorage.removeItem('eklavya_store');
    setUser(null);
    setStore(null);
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ user, store, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
