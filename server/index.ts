import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { createAuthRouter } from "./auth";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import session from 'express-session';
import cookieParser from 'cookie-parser';

dotenv.config();

const app = express();
// Configure CORS with dynamic origin based on request
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Define allowed origins
    const allowedOrigins = [
      'http://localhost:3001',  // Vite dev server
      'http://localhost:3000',  // Express server
      'http://127.0.0.1:3001',  // Alternative localhost
      'http://127.0.0.1:3000',  // Alternative localhost
      process.env.CLIENT_URL,
      process.env.SHOPWARE_URL || 'https://vinaturel.de'
    ].filter(Boolean) as string[];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('No origin, allowing request');
      return callback(null, true);
    }
    
    console.log('Checking CORS for origin:', origin);
    
    // Check if the origin is allowed
    const isAllowed = allowedOrigins.some(
      allowed => origin === allowed || 
               origin.startsWith(allowed) ||
               origin.includes('localhost:') ||
               origin.includes('127.0.0.1')
    );
    
    if (isAllowed) {
      console.log('Origin allowed by CORS:', origin);
      callback(null, true);
    } else {
      console.warn('CORS blocked for origin:', origin);
      console.warn('Allowed origins:', allowedOrigins);
      callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-Requested-With',
    'X-Auth-Token',
    'sw-context-token',
    'sw-access-key'
  ],
  exposedHeaders: [
    'Content-Range', 
    'X-Total-Count',
    'sw-context-token',
    'sw-access-key'
  ],
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware with custom headers
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  
  // Check if origin is allowed
  const allowedOrigins = [
    'http://localhost:3001',
    'http://localhost:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3000',
    process.env.CLIENT_URL,
    process.env.SHOPWARE_URL || 'https://vinaturel.de'
  ].filter(Boolean) as string[];
  
  if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Auth-Token, sw-context-token, sw-access-key');
    res.header('Access-Control-Expose-Headers', 'Content-Range, X-Total-Count, sw-context-token, sw-access-key');
  }
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    headers: req.headers,
    body: req.body,
    query: req.query,
    params: req.params
  });
  next();
});

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Logging middleware for API requests
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  // Skip logging for OAuth callback to avoid logging tokens
  if (path.startsWith('/api/auth/oauth/callback')) {
    // Still log the request but not the response body
    res.on('finish', () => {
      const duration = Date.now() - start;
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    });
    return next();
  }

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // In development, use Vite's middleware for serving and HMR
  if (process.env.NODE_ENV === 'development') {
    await setupVite(app, server);
  } else {
    // In production, serve static files from the dist directory
    const distPath = path.resolve(import.meta.dirname, '..', 'dist', 'public');
    app.use(express.static(distPath));
  }
  
  // Handle 404 for API routes
  app.use('/api/*', (req, res) => {
    res.status(404).json({ message: 'API endpoint not found' });
  });
  
  // For all other routes, serve the SPA
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    
    if (process.env.NODE_ENV === 'development') {
      // In development, let Vite handle the request
      const vite = (app as any).vite;
      if (!vite) {
        return res.status(500).send('Vite not initialized');
      }
      
      const url = req.originalUrl;
      try {
        const template = fs.readFileSync(
          path.resolve(import.meta.dirname, '..', 'client', 'index.html'),
          'utf-8'
        );
        
        vite.transformIndexHtml(url, template).then((html: string) => {
          res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
        }).catch((e: Error) => {
          vite.ssrFixStacktrace(e);
          next(e);
        });
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    } else {
      // In production, serve the built index.html
      const distPath = path.resolve(import.meta.dirname, '..', 'dist', 'public');
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });

  // Error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    console.error('Error:', err);
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 3000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 3000; // Force port 3000 for backend
  
  console.log(`Starting server on port ${port}...`);
  
  // Listen only on IPv4 to avoid issues with IPv6
  server.listen(port, '0.0.0.0', () => {
    log(`Server is running on http://0.0.0.0:${port}`);
    log(`Access the application at http://localhost:${port}`);
  });
})();
