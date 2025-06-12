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

  const checkAuth = async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      // Set the token in the headers
      axios.defaults.headers.common['sw-context-token'] = token;
      
      // Try to fetch customer data
      const me = await axios.get('/store-api/account/customer', {
        baseURL: import.meta.env.VITE_API_URL,
        headers: {
          'Content-Type': 'application/json',
          'sw-access-key': import.meta.env.VITE_SHOPWARE_ACCESS_KEY,
          'sw-context-token': token,
          'sw-language-id': '2fbb5fe2e29a4d70aa5854ce7ce3e20b'
        },
        withCredentials: false
      });
      
      // If we got here, the token is valid and we have customer data
      setUser({
        id: me.data.id,
        email: me.data.email,
        name: `${me.data.firstName ?? ''} ${me.data.lastName ?? ''}`.trim()
      });
    } catch (err) {
      console.error('Auth check failed:', err);
      // Clear invalid token
      localStorage.removeItem('authToken');
      delete axios.defaults.headers.common['sw-context-token'];
      setUser(null);
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

    // Clear any existing tokens
    delete axios.defaults.headers.common['sw-context-token'];
    localStorage.removeItem('authToken');

    try {
      // Step 1: Create a guest session first
      const guestResponse = await axios.post(
        '/store-api/checkout/cart',
        {},
        {
          baseURL: import.meta.env.VITE_API_URL,
          headers: {
            'Content-Type': 'application/json',
            'sw-access-key': import.meta.env.VITE_SHOPWARE_ACCESS_KEY
          },
          withCredentials: false
        }
      );

      const guestToken = guestResponse.headers['sw-context-token'] || 
                      guestResponse.headers['sw-context-token'.toLowerCase()] ||
                      guestResponse.data?.token;

      if (!guestToken) {
        throw new Error('Could not create guest session');
      }

      // Step 2: Login with the guest token
      const loginResponse = await axios.post(
        '/store-api/account/login',
        { 
          email, 
          password,
          include: ['customer', 'contextToken']
        },
        {
          baseURL: import.meta.env.VITE_API_URL,
          headers: {
            'Content-Type': 'application/json',
            'sw-access-key': import.meta.env.VITE_SHOPWARE_ACCESS_KEY,
            'sw-context-token': guestToken,
            'sw-language-id': '2fbb5fe2e29a4d70aa5854ce7ce3e20b' // German
          },
          withCredentials: false
        }
      );

      // Get context token from response
      const contextToken = loginResponse.headers['sw-context-token'] || 
                         loginResponse.headers['sw-context-token'.toLowerCase()] ||
                         loginResponse.data?.contextToken;

      if (!contextToken) {
        throw new Error('No context token received from Shopware');
      }

      // Store the new token
      localStorage.setItem('authToken', contextToken);
      axios.defaults.headers.common['sw-context-token'] = contextToken;
      // Check if customer data is included in the login response
      if (loginResponse.data?.customer) {
        const customer = loginResponse.data.customer;
        setUser({
          id: customer.id,
          email: customer.email,
          name: `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim()
        });
        setLoading(false);
        return;
      }

      // If no customer data in login response, try to fetch it separately
      try {
        const me = await axios.get('/store-api/account/customer', {
          baseURL: import.meta.env.VITE_API_URL,
          headers: {
            'Content-Type': 'application/json',
            'sw-access-key': import.meta.env.VITE_SHOPWARE_ACCESS_KEY,
            'sw-context-token': contextToken,
            'sw-language-id': '2fbb5fe2e29a4d70aa5854ce7ce3e20b'
          },
          withCredentials: false
        });
        
        setUser({
          id: me.data.id,
          email: me.data.email,
          name: `${me.data.firstName ?? ''} ${me.data.lastName ?? ''}`.trim()
        });
      } catch (error) {
        console.error('Failed to fetch customer data:', error);
        // If we can't fetch customer data, still consider the login successful
        // but with limited user data
        setUser({
          id: 'unknown',
          email: email,
          name: email
        });
      }


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

  const logout = async () => {
    const token = localStorage.getItem('authToken');
    
    try {
      // Try to logout on the server if we have a token
      if (token) {
        await axios.post('/store-api/account/logout', {}, {
          baseURL: import.meta.env.VITE_API_URL,
          headers: {
            'Content-Type': 'application/json',
            'sw-access-key': import.meta.env.VITE_SHOPWARE_ACCESS_KEY,
            'sw-context-token': token,
            'sw-language-id': '2fbb5fe2e29a4d70aa5854ce7ce3e20b'
          },
          withCredentials: false
        });
      }
    } catch (err) {
      console.error('Logout error:', err);
      // Continue with local cleanup even if server logout fails
    } finally {
      // Clean up local data
      localStorage.removeItem('authToken');
      delete axios.defaults.headers.common['sw-context-token'];
      setUser(null);
      setError(null);
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
