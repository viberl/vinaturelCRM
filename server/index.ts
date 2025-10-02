import "./env";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { createAuthRouter } from "./auth";
import cors from "cors";
import path from "path";
import fs from "fs";
import session from 'express-session';
import cookieParser from 'cookie-parser';

const app = express();
// Erweiterte CORS-Konfiguration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000',
  'https://www.vinaturel.de',
  'https://vinaturel.de',
  ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : []),
  ...(process.env.SHOPWARE_URL ? [process.env.SHOPWARE_URL] : [])
].filter(Boolean) as string[];

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  const requestMethod = req.method;
  const requestHeaders = req.headers['access-control-request-headers'];
  
  console.log('Incoming request:', {
    method: req.method,
    path: req.path,
    origin,
    headers: req.headers
  });
  
  // Erlaube Anfragen mit erlaubter Origin oder ohne Origin (z.B. curl, mobile Apps)
  if (!origin || allowedOrigins.includes(origin)) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      console.log('CORS: Allowed origin:', origin);
    } else {
      console.log('CORS: No origin, allowing request');
    }
    
    // Setze CORS Header
    const allowedMethods = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
    const allowedHeaders = [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'sw-context-token',
      'access-control-allow-credentials',
      'access-control-allow-origin',
      'access-control-allow-headers',
      'access-control-allow-methods'
    ];
    
    res.setHeader('Access-Control-Allow-Methods', allowedMethods);
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 Stunden
    
    // Behandle Preflight-Anfragen
    if (requestMethod === 'OPTIONS') {
      console.log('CORS: Handling preflight request', {
        'access-control-request-method': req.headers['access-control-request-method'],
        'access-control-request-headers': req.headers['access-control-request-headers']
      });
      
      // Setze die angeforderten Header
      if (req.headers['access-control-request-method']) {
        res.setHeader('Access-Control-Allow-Methods', req.headers['access-control-request-method']);
      }
      
      if (requestHeaders) {
        res.setHeader('Access-Control-Allow-Headers', requestHeaders);
      }
      
      console.log('Sending preflight response with headers:', {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': res.getHeader('Access-Control-Allow-Methods'),
        'Access-Control-Allow-Headers': res.getHeader('Access-Control-Allow-Headers'),
        'Access-Control-Allow-Credentials': 'true'
      });
      
      return res.status(200).end();
    }
  } else {
    console.warn('CORS: Blocked origin:', origin, 'Allowed origins:', allowedOrigins);
    return res.status(403).json({ message: 'Not allowed by CORS' });
  }

  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    headers: req.headers,
    body: req.body,
    query: req.query,
    params: req.params
  });
  next();
});

// Logge alle eingehenden Anfragen
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    origin: req.headers.origin,
    'user-agent': req.headers['user-agent']
  });
  next();
});

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    headers: req.headers,
    body: req.body,
    query: req.query,
    params: req.params
  });
  next();
});

const DEFAULT_BODY_LIMIT = process.env.BODY_LIMIT ?? '5mb';

app.use(express.json({ limit: DEFAULT_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: DEFAULT_BODY_LIMIT }));
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

// Wrap in an async IIFE to use top-level await
(async () => {
  // First, register all API routes
  const { httpServer, io } = await registerRoutes(app);

  // Then, set up the frontend
  if (process.env.NODE_ENV === 'development') {
    await setupVite(app, httpServer);
  } else {
    serveStatic(app);
  }
    
  // Handle 404 for API routes
  app.use('/admin-api/*', (req, res) => {
    res.status(404).json({ message: 'Admin API endpoint not found' });
  });
  
  app.use('/api/*', (req, res) => {
    res.status(404).json({ message: 'API endpoint not found' });
  });

  // Error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    console.error('Error:', err);
    res.status(status).json({ message });
  });

  // ALWAYS serve the app on port 3000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  
  console.log(`Starting server on port ${port}...`);
  
  // Listen only on IPv4 to avoid issues with IPv6
  httpServer.listen(port, '0.0.0.0', () => {
    log(`Server is running on http://0.0.0.0:${port}`);
    log(`WebSocket server ready`);
    log(`Access the application at http://localhost:${port}`);
  });
})();
