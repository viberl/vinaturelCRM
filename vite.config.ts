import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from 'url';
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { createProxyConfig } from './client/lib/vite-proxy';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const shopwareUrl = process.env.SHOPWARE_URL || 'https://www.vinaturel.de';
const accessKey = process.env.VITE_SHOPWARE_ACCESS_KEY || '';
const apiVersion = process.env.VITE_SHOPWARE_API_VERSION || '3';

// Create proxy configuration
const proxyConfig = createProxyConfig(shopwareUrl, accessKey, apiVersion);

// Server configuration
const serverConfig = {
  port: 3001,
  strictPort: true,
  proxy: proxyConfig,
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'https://www.vinaturel.de',
      'https://vinaturel.de',
      /^http:\/\/localhost:\d+$/,  // Allow any localhost with any port
      /^http:\/\/127\.0\.0\.1:\d+$/ // Allow any 127.0.0.1 with any port
    ],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'sw-access-key',
      'sw-context-token',
      'sw-language-id',
      'sw-version-id',
      'sw-include-seo-urls',
      'X-Requested-With',
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Headers'
    ],
    exposedHeaders: [
      'sw-context-token',
      'set-cookie',
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Credentials',
      'Access-Control-Allow-Headers',
      'Access-Control-Allow-Methods'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    preflightContinue: false,
    optionsSuccessStatus: 204
  },
  hmr: {
    clientPort: 3001,
    protocol: 'ws',
    host: 'localhost'
  },
  fs: {
    strict: false,
    allow: ['..']
  }
};

// Main config
export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
      ? [
          import("@replit/vite-plugin-cartographer").then(m => m.cartographer())
        ]
      : [])
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "client", "index.html")
      }
    }
  },
  define: {
    'process.env': {
      ...process.env,
      VITE_API_URL: JSON.stringify(process.env.VITE_API_URL || 'https://www.vinaturel.de'),
      VITE_SHOPWARE_ACCESS_KEY: JSON.stringify(process.env.VITE_SHOPWARE_ACCESS_KEY || ''),
      VITE_DEV: JSON.stringify(process.env.NODE_ENV !== 'production')
    }
  },
  server: serverConfig
});
