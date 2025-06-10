import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// Load environment variables
const shopwareUrl = process.env.SHOPWARE_URL || 'https://vinaturel.de';

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  // Make environment variables available to the client
  define: {
    'process.env.VITE_API_URL': JSON.stringify('http://localhost:3000'),
    'process.env.VITE_SHOPWARE_URL': JSON.stringify(shopwareUrl),
  },
  
  server: {
    host: '0.0.0.0',
    port: 3001,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 3001
    },
    fs: {
      strict: false,
      allow: ['..'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', {
              method: req.method,
              path: req.url,
              headers: req.headers,
            });
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', {
              statusCode: proxyRes.statusCode,
              statusMessage: proxyRes.statusMessage,
              headers: proxyRes.headers,
            });
          });
        }
      }
    },
    cors: {
      origin: ['http://localhost:3001', 'http://localhost:3000'],
      credentials: true
    }
  },
});
