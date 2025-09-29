import type { ProxyOptions } from 'vite';

// Type definitions for proxy events
type ProxyErrorEvent = (err: Error, req: any, res: any) => void;
type ProxyRequestEvent = (proxyReq: any, req: any, res: any) => void;
type ProxyResponseEvent = (proxyRes: any, req: any, res: any) => void;

interface ProxyConfig {
  target: string;
  changeOrigin?: boolean;
  secure?: boolean;
  rewrite?: (path: string) => string;
  configure?: (proxy: any, options: any) => void;
  ws?: boolean;
}

export function createProxyConfig(shopwareUrl: string, accessKey: string, apiVersion: string): Record<string, string | ProxyConfig> {
  const backendTarget = process.env.VITE_BACKEND_PROXY_TARGET || 'http://localhost:3000';

  const config: Record<string, string | ProxyConfig> = {
    '/api': {
      target: backendTarget,
      changeOrigin: true,
      secure: false
    },
    '/admin-api': {
      target: backendTarget,
      changeOrigin: true,
      secure: false
    },
    '/socket.io': {
      target: backendTarget,
      changeOrigin: true,
      ws: true,
      secure: false
    }
  };

  return config;
}
