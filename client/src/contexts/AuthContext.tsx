import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '@/lib/api';

export interface User {
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
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('authToken');
      
      if (token) {
        try {
          // Get current user data
          const response = await api.get('/auth/me');
          
          if (response.data.success && response.data.user) {
            setUser({
              id: response.data.user.id,
              email: response.data.user.email,
              firstName: response.data.user.firstName,
              lastName: response.data.user.lastName,
              customerNumber: response.data.user.customerNumber,
              role: response.data.user.role,
              contextToken: response.data.user.contextToken
            });
          } else {
            throw new Error('Ungültige Benutzerdaten erhalten');
          }
        } catch (err) {
          console.error('Auth check failed:', err);
          // Clear invalid token
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
    try {
      const response = await api.post('/auth/login', { email, password });
      
      if (response.data.success && response.data.token) {
        // Store the token
        localStorage.setItem('authToken', response.data.token);
        
        // Set user data
        setUser({
          id: response.data.user.id,
          email: response.data.user.email,
          firstName: response.data.user.firstName,
          lastName: response.data.user.lastName,
          customerNumber: response.data.user.customerNumber,
          role: response.data.user.role,
          contextToken: response.data.user.contextToken
        });
      } else {
        throw new Error('Ungültige Antwort vom Server');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      const errorMessage = err.response?.data?.message || 
                         err.message || 
                         'Anmeldung fehlgeschlagen. Bitte versuchen Sie es später erneut.';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Call logout API if user is logged in
      if (user?.contextToken) {
        await api.post('/auth/logout');
      }
    } catch (err) {
      console.error('Logout error:', err);
      // Continue with local logout even if API call fails
    } finally {
      // Clear local auth state
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
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
