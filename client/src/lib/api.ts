import axios from 'axios';

// Debug environment variables
console.log('Environment variables:', {
  NODE_ENV: import.meta.env.MODE,
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_DEV: import.meta.env.VITE_DEV
});

// Determine API base URL based on environment
const isDev = import.meta.env.VITE_DEV === 'true';
const API_BASE_URL = isDev 
  ? 'http://localhost:3000'  // Local development
  : import.meta.env.VITE_API_URL || 'https://www.vinaturel.de';

console.log('Using API base URL:', API_BASE_URL);

// Create axios instance with base URL
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,  // Send cookies with requests
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Requested-With, Content-Type, Authorization, sw-access-key, sw-context-token'
  }
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers['sw-context-token'] = token;
  }
  return config;
});

// Add response interceptor to handle context tokens
api.interceptors.response.use(
  (response) => {
    // Update context token from response headers if present
    const contextToken = response.headers['sw-context-token'];
    if (contextToken) {
      localStorage.setItem('authToken', contextToken);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized (e.g., token expired)
      localStorage.removeItem('authToken');
    }
    return Promise.reject(error);
  }
);

// Add request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log('Request:', {
      method: config.method?.toUpperCase(),
      url: config.url,
      baseURL: config.baseURL,
      headers: config.headers,
      data: config.data,
    });
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for logging
api.interceptors.response.use(
  (response) => {
    console.log('Response:', {
      status: response.status,
      statusText: response.statusText,
      data: response.data,
      headers: response.headers,
    });
    return response;
  },
  (error) => {
    console.error('Response error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      headers: error.response?.headers,
    });
    return Promise.reject(error);
  }
);

console.log('API base URL:', API_BASE_URL);

// Add a request interceptor to include the auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized error
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
