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
}

export function createProxyConfig(shopwareUrl: string, accessKey: string, apiVersion: string): Record<string, string | ProxyConfig> {
  return {
    '/api': {
      target: shopwareUrl,
      changeOrigin: true,
      secure: false,
      // Don't rewrite the path, let the server handle it
      // rewrite: (path: string) => path.replace(/^\/api/, ''),
      configure: (proxy: any, _options: any) => {
        proxy.on('proxyReq', (proxyReq: any, req: any, _res: any) => {
          console.log('Proxying request to:', req.method, req.url);
          // Set Shopware required headers
          proxyReq.setHeader('sw-access-key', accessKey);
          proxyReq.setHeader('sw-version', apiVersion);
          proxyReq.setHeader('sw-language-id', '2fbb5fe2e29a4ce58563f1b7853f6d7b');
          proxyReq.setHeader('sw-include-seo-urls', 'true');
          
          // Log request for debugging
          console.log('Request Headers:', JSON.stringify(proxyReq.getHeaders(), null, 2));
        });
        
        proxy.on('proxyRes', (proxyRes: any, req: any, _res: any) => {
          console.log('Received response from Shopware:', proxyRes.statusCode, req.url);
          // Set CORS headers
          proxyRes.headers['Access-Control-Allow-Origin'] = req.headers.origin || 'http://localhost:5173';
          proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
          proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
          proxyRes.headers['Access-Control-Allow-Headers'] = 'X-Requested-With, Content-Type, Authorization, sw-access-key, sw-context-token';
          
          // Log response headers for debugging
          console.log('Response Headers:', JSON.stringify(proxyRes.headers, null, 2));
        });
        
        proxy.on('error', (err: Error, _req: any, _res: any) => {
          console.error('Proxy error:', err);
        });
      }
    }
  };
}
