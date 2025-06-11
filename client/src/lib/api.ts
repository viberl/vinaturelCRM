import axios from 'axios';

// Debug environment variables
console.log('Environment variables:', {
  NODE_ENV: import.meta.env.MODE,
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_DEV: import.meta.env.VITE_DEV,
  VITE_SHOPWARE_ACCESS_KEY: import.meta.env.VITE_SHOPWARE_ACCESS_KEY
});

// Base‑URL: always the one from env
const API_BASE_URL = import.meta.env.VITE_API_URL;
console.log('Using API base URL:', API_BASE_URL);

// Axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,           // No cookies for Store‑API
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  }
});

// ▸ add Shopware access key to every request
api.interceptors.request.use(cfg => {
  cfg.headers.set('sw-access-key', import.meta.env.VITE_SHOPWARE_ACCESS_KEY);
  // add stored context token (if any)
  const token = localStorage.getItem('authToken');
  if (token) cfg.headers.set('sw-context-token', token);
  return cfg;
});

// ▸ store new context token if Shopware returns one
api.interceptors.response.use(res => {
  const ctx = res.headers['sw-context-token'] || res.headers['sw-context-token'.toLowerCase()];
  if (ctx) localStorage.setItem('authToken', ctx as string);
  return res;
});

export default api;
