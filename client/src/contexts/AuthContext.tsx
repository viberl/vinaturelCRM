import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  customerNumber?: string | null;
  role?: string;
  salesRepEmail?: string | null;
  salesRepId?: string | null;
  contextToken?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mapUser = (userData: any): User => {
    const firstName = userData.firstName ?? null;
    const lastName = userData.lastName ?? null;
    const name = `${firstName ?? ''} ${lastName ?? ''}`.trim() || userData.name || userData.email;

    return {
      id: userData.id,
      email: userData.email,
      name,
      firstName,
      lastName,
      customerNumber: userData.customerNumber ?? null,
      role: userData.role ?? 'user',
      salesRepEmail: userData.salesRepEmail ?? null,
      salesRepId: userData.salesRepId ?? null,
      contextToken: userData.contextToken
    };
  };

  const clearSession = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('jwtToken');
    setUser(null);
    queryClient.clear();
  };

  const checkAuth = async () => {
    const jwtToken = typeof window !== 'undefined' ? localStorage.getItem('jwtToken') : null;
    if (!jwtToken) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const response = await api.get('/api/auth/me');
      if (response.data?.success && response.data?.user) {
        const mappedUser = mapUser(response.data.user);
        setUser(mappedUser);
      } else {
        clearSession();
      }
    } catch (err) {
      console.error('Auth check failed:', err);
      clearSession();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);

    clearSession();

    try {
      const response = await api.post('/api/login', { email, password });

      if (!response.data?.success || !response.data?.token || !response.data?.user) {
        throw new Error(response.data?.message || 'Login fehlgeschlagen');
      }

      const { token, user: userData } = response.data;

      if (userData.contextToken) {
        localStorage.setItem('authToken', userData.contextToken);
      }
      localStorage.setItem('jwtToken', token);

      const mappedUser = mapUser(userData);
      setUser(mappedUser);
      await queryClient.invalidateQueries({ queryKey: ['/admin-api/search/customer'] });
      await queryClient.invalidateQueries({ queryKey: ['/admin-api/customer'] });
    } catch (err: any) {
      console.error('Login error:', err);
      setError(
        err.response?.data?.message ??
          'Login fehlgeschlagen. Bitte Anmeldedaten prüfen.'
      );
      clearSession();
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.post('/api/logout');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      clearSession();
      setError(null);
      queryClient.removeQueries();
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
