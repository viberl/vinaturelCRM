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

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check if we have a stored token
        const storedToken = localStorage.getItem('authToken');
        if (storedToken) {
          axios.defaults.headers.common['sw-context-token'] = storedToken;
          try {
            // Try fetching customer profile
            const me = await axios.get('/store-api/account/customer', {
              baseURL: import.meta.env.VITE_API_URL,
              headers: {
                'sw-context-token': storedToken,
                'sw-access-key': import.meta.env.VITE_SHOPWARE_ACCESS_KEY
              }
            });
            setUser({
              id: me.data.id,
              email: me.data.email,
              name: `${me.data.firstName ?? ''} ${me.data.lastName ?? ''}`.trim()
            });
          } catch {
            // 403 → Gast‑Token, treat as not logged in
            setUser(null);
          }
        }
      } catch (err) {
        console.error('Auth check failed:', err);
        setError('Fehler bei der Authentifizierung. Bitte versuchen Sie es erneut.');
        localStorage.removeItem('authToken');
        delete axios.defaults.headers.common['sw-context-token'];
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);

    delete axios.defaults.headers.common['sw-context-token'];
    localStorage.removeItem('authToken');

    try {
      // POST direkt an die Shopware‑Store‑API
      const res = await axios.post(
        '/store-api/account/login',
        { email, password,
          include: ['customer'] },
        {
          baseURL: import.meta.env.VITE_API_URL,
          headers: {
            'Content-Type': 'application/json',
            'sw-access-key': import.meta.env.VITE_SHOPWARE_ACCESS_KEY
          },
          withCredentials: false
        }
      );

      // Context‑Token aus Header oder Body holen
      const ctxToken =
        res.headers['sw-context-token'] ||
        res.headers['sw-context-token'.toLowerCase()] ||
        res.data?.contextToken;

      if (!ctxToken) {
        throw new Error('Shopware lieferte keinen Context‑Token');
      }

      // Neuen Token speichern und für alle künftigen Requests setzen
      localStorage.setItem('authToken', ctxToken as string);
      axios.defaults.headers.common['sw-context-token'] = ctxToken as string;
      // Wenn Shopware keinen customer mitsendet, belassen wir user vorerst auf null.

      // Falls Shopware direkt einen customer im Body mitliefert (weil wir include:['customer'] gesendet haben)
      if (res.data?.customer) {
        const c = res.data.customer;
        setUser({
          id: c.id,
          email: c.email,
          name: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()
        });
        setLoading(false);
        return;
      }

      // Optional: Kundenprofil laden, falls noch kein customer im Body
      if (!res.data?.customer) {
        try {
          const me = await axios.get('/store-api/account/customer', {
            baseURL: import.meta.env.VITE_API_URL,
            headers: {
              'sw-context-token': ctxToken,
              'sw-access-key': import.meta.env.VITE_SHOPWARE_ACCESS_KEY
            }
          });
          setUser({
            id: me.data.id,
            email: me.data.email,
            name: `${me.data.firstName ?? ''} ${me.data.lastName ?? ''}`.trim()
          });
        } catch {
          // 403 → Gast‑Token; akzeptieren, user bleibt null
          setUser(null);
        }
      }

      /*
      // Optional: Kundenprofil laden
      try {
        const me = await axios.get('/store-api/account/customer', {
          baseURL: import.meta.env.VITE_API_URL,
          headers: {
            'sw-context-token': ctxToken,
            'sw-access-key': import.meta.env.VITE_SHOPWARE_ACCESS_KEY
          }
        });
        setUser({
          id: me.data.id,
          email: me.data.email,
          name: `${me.data.firstName ?? ''} ${me.data.lastName ?? ''}`.trim()
        });
      } catch {
        // 403 → Gast‑Token; wir akzeptieren das, user bleibt null
        setUser(null);
      }
      */
    } catch (err: any) {
      console.error('Login error:', err);
      setError(
        err.response?.data?.message ??
          'Login fehlgeschlagen. Bitte Anmeldedaten prüfen.'
      );
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    delete axios.defaults.headers.common['sw-context-token'];
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
