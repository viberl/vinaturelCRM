import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';
import api from '@/lib/api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  customerNumber: string;
  role: string;
  contextToken?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('authToken');
      if (token) {
        try {
          const response = await api.get('/api/auth/me');
          setUser(response.data);
        } catch (err) {
          console.error('Auth check failed:', err);
          localStorage.removeItem('authToken');
          setError('Fehler bei der Authentifizierung. Bitte melden Sie sich erneut an.');
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };
    
    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    
    console.log('Starting login process...');
    
    try {
      console.log('Sending login request to /api/auth/login');
      
      const response = await api.post('/api/auth/login', {
        email,
        password
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        withCredentials: true
      });
      
      console.log('Login response received:', response);
      
      const { user: userData, token } = response.data;
      
      if (!userData || !token) {
        console.error('Invalid response from server:', response.data);
        throw new Error('Ungültige Antwort vom Server');
      }
      
      console.log('User data received:', userData);
      
      const user: User = {
        id: userData.id,
        email: userData.email,
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        customerNumber: userData.customerNumber || '',
        role: userData.role || 'customer',
        contextToken: token
      };
      
      console.log('Setting auth token in localStorage');
      localStorage.setItem('authToken', token);
      
      console.log('Updating user state');
      setUser(user);
      
      return user;
    } catch (err: any) {
      console.error('Login error:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        config: {
          url: err.config?.url,
          method: err.config?.method,
          headers: err.config?.headers,
          data: err.config?.data
        }
      });
      
      let errorMessage = 'Anmeldung fehlgeschlagen. Bitte überprüfen Sie Ihre Anmeldedaten.';
      
      if (err.response) {
        // Server responded with an error status code
        errorMessage = err.response.data?.message || err.message || errorMessage;
      } else if (err.request) {
        // Request was made but no response was received
        errorMessage = 'Keine Antwort vom Server. Bitte überprüfen Sie Ihre Internetverbindung.';
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      localStorage.removeItem('authToken');
      setUser(null);
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
    throw new Error('useAuth muss innerhalb eines AuthProviders verwendet werden');
  }
  return context;
}

export default AuthProvider;
