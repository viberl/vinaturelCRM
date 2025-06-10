import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';

interface User {
  id: string;
  email: string;
  name: string;
  // Add other user fields as needed from Shopware 6
}

interface AuthContextType {
  user: User | null;
  login: () => Promise<void>;
  logout: () => void;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for token in URL after redirect
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const error = params.get('error');
    
    if (token) {
      // We have a token from the redirect
      localStorage.setItem('authToken', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      // Get user info using the token
      const fetchUser = async () => {
        try {
          const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/user`);
          setUser(response.data);
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (err) {
          console.error('Failed to fetch user:', err);
          setError('Fehler beim Laden der Benutzerdaten');
          logout();
        } finally {
          setLoading(false);
        }
      };
      
      fetchUser();
      return;
    }

    const checkAuth = async () => {
      try {
        if (error) {
          // Handle error from redirect
          console.error('Login error:', error);
          setError('Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.');
        } else {
          // Check if we have a stored token
          const storedToken = localStorage.getItem('authToken');
          if (storedToken) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
            try {
              const response = await axios.get('/api/auth/me');
              setUser(response.data);
            } catch (err) {
              // Token might be expired, clear it
              localStorage.removeItem('authToken');
              delete axios.defaults.headers.common['Authorization'];
            }
          }
        }
      } catch (err) {
        console.error('Auth check failed:', err);
        setError('Fehler bei der Authentifizierung. Bitte versuchen Sie es erneut.');
        localStorage.removeItem('authToken');
        delete axios.defaults.headers.common['Authorization'];
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async () => {
    setLoading(true);
    setError(null);
    try {
      // Redirect to our login endpoint which will handle the Shopware flow
      window.location.href = '/api/auth/login';
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.response?.data?.message || 'Login fehlgeschlagen. Bitte versuchen Sie es später erneut.');
      setLoading(false);
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
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
