import { Express, Request, Response, NextFunction, json } from "express";
import { createServer, Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket, DefaultEventsMap } from "socket.io";
import type { Server as SocketIOServerType } from 'socket.io';
import { storage } from "./storage";
import { insertCustomerSchema, insertInteractionSchema } from "@shared/schema";
import cors from "cors";
import dotenv from "dotenv";
import { 
  loginCustomer, 
  getCurrentCustomer, 
  logoutCustomer, 
  LoginResponse, 
  CustomerData,
  ShopwareApiError
} from "./shopware";
import { auth, AuthRequest, generateToken } from "./auth";
import jwt from 'jsonwebtoken';
import {
  SocketAuthData,
  SocketUserData,
  SocketData,
  ClientToServerEvents,
  ServerToClientEvents,
  CustomSocket,
  CustomSocketIOServer
} from "./types/socket.types";

// Extend the default Socket.IO types
declare module 'socket.io' {
  // Add user property to the Socket interface
  interface Socket {
    user?: SocketUserData;
  }
  
  // Add index signature to avoid type errors
  interface Server {
    [key: string]: any;
  }
}

// Load environment variables
dotenv.config();

// Ensure required environment variables are set
if (!process.env.JWT_SECRET) {
  console.warn('WARNUNG: JWT_SECRET ist nicht gesetzt. Verwende Standardwert.');
}

if (!process.env.SHOPWARE_URL) {
  throw new Error('SHOPWARE_URL muss in der .env Datei gesetzt sein');
}

if (!process.env.SHOPWARE_ACCESS_KEY) {
  throw new Error('SHOPWARE_ACCESS_KEY muss in der .env Datei gesetzt sein');
}

if (!process.env.CLIENT_URL) {
  console.warn('WARNUNG: CLIENT_URL ist nicht gesetzt. Verwende Standardwert.');
}

export async function registerRoutes(app: Express): Promise<{ httpServer: ReturnType<typeof createServer>; io: CustomSocketIOServer }> {
  // CORS wird bereits in index.ts konfiguriert
  
  // Parse JSON bodies
  app.use(json());
  
  // Enable pre-flight for all routes
  app.options('*', (req, res) => {
    res.status(200).end();
  });

  // Define interfaces for better type safety
  interface LoginRequest {
    email: string;
    password: string;
  }
  
  interface LoginResponseData {
    success: boolean;
    token?: string;
    user?: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      customerNumber: string;
      role: string;
      contextToken?: string;
    };
    message?: string;
    code?: string;
    errorId?: string;
    timestamp?: string;
  }

  // Login handler for both endpoints
  const handleLogin = async (req: Request<{}, {}, LoginRequest>, res: Response<LoginResponseData>) => {
    console.log('Login request received:', { 
      headers: req.headers,
      body: { ...req.body, password: req.body.password ? '***' : undefined },
      ip: req.ip,
      method: req.method,
      url: req.originalUrl,
      timestamp: new Date().toISOString()
    });
    
    try {
      const { email, password } = req.body;
      
      // Validate request body
      if (!email || !password) {
        console.log('Missing email or password');
        const errorResponse: LoginResponseData = { 
          success: false, 
          message: 'E-Mail und Passwort werden benötigt',
          code: 'MISSING_CREDENTIALS',
          timestamp: new Date().toISOString()
        };
        return res.status(400).json(errorResponse);
      }

      // Login to Shopware
      console.log('Attempting to login to Shopware...');
      let loginResponse: LoginResponse;
      try {
        loginResponse = await loginCustomer(email, password);
        console.log('Shopware login successful, context token received');
      } catch (error: unknown) {
        const shopwareError = error as ShopwareApiError;
        console.error('Shopware login error:', {
          message: shopwareError.message,
          status: shopwareError.status,
          response: shopwareError.response?.data,
          stack: shopwareError.stack
        });
        
        // Handle specific Shopware errors
        if (shopwareError.status === 401) {
          return res.status(401).json({
            success: false,
            message: 'Ungültige Anmeldedaten. Bitte überprüfen Sie E-Mail und Passwort.',
            code: 'INVALID_CREDENTIALS',
            timestamp: new Date().toISOString()
          });
        }
        
        // Handle network errors
        if (shopwareError.code === 'ECONNREFUSED' || shopwareError.code === 'ENOTFOUND') {
          return res.status(503).json({
            success: false,
            message: 'Verbindung zum Server fehlgeschlagen. Bitte versuchen Sie es später erneut.',
            code: 'SERVICE_UNAVAILABLE',
            timestamp: new Date().toISOString()
          });
        }
        
        // Handle other errors
        return res.status(500).json({
          success: false,
          message: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
          code: 'INTERNAL_SERVER_ERROR',
          timestamp: new Date().toISOString()
        });
      }
      
      // Get customer data
      console.log('Fetching customer data...');
      let customer: CustomerData;
      try {
        customer = await getCurrentCustomer(loginResponse.contextToken);
        console.log('Customer data received:', { 
          id: customer.id, 
          email: customer.email,
          group: customer.group?.name,
          timestamp: new Date().toISOString()
        });
      } catch (error: unknown) {
        const customerError = error as ShopwareApiError;
        console.error('Error fetching customer data:', {
          message: customerError.message,
          status: customerError.status,
          response: customerError.response,
          stack: customerError.stack,
          timestamp: new Date().toISOString()
        });
        
        // Handle specific customer data errors
        if (customerError.status === 401) {
          return res.status(401).json({
            success: false,
            message: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
            code: 'SESSION_EXPIRED',
            timestamp: new Date().toISOString()
          });
        }
        
        return res.status(500).json({
          success: false,
          message: 'Fehler beim Laden der Benutzerdaten. Bitte versuchen Sie es später erneut.',
          code: 'CUSTOMER_DATA_ERROR',
          timestamp: new Date().toISOString()
        });
      }
/*
      // Check if user is a sales rep
      const isSalesRep = customer.group?.name === 'Außendienstmitarbeiter';
      
      if (!isSalesRep) {
        console.log('Access denied: User is not a sales rep', { 
          userId: customer.id, 
          email: customer.email,
          group: customer.group?.name,
          timestamp: new Date().toISOString()
        });
        
        return res.status(403).json({
          success: false,
          message: 'Zugriff verweigert. Sie benötigen Verkäuferrechte.',
          code: 'ACCESS_DENIED',
          timestamp: new Date().toISOString()
        });
      }
      */

      // Generate JWT token
      console.log('Generating JWT token...');
      let token;
      try {
        const tokenData = {
          id: customer.id,
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          customerNumber: customer.customerNumber,
          role: 'sales_rep',
          contextToken: loginResponse.contextToken,
          timestamp: new Date().toISOString()
        };
        
        console.log('Creating JWT token with data:', {
          ...tokenData,
          contextToken: '***REDACTED***'
        });
        
        token = generateToken(tokenData);
        
        console.log('JWT token generated successfully', {
          userId: customer.id,
          tokenLength: token?.length || 0,
          timestamp: new Date().toISOString()
        });
      } catch (tokenError: any) {
        console.error('Error generating JWT token:', {
          message: tokenError.message,
          stack: tokenError.stack,
          timestamp: new Date().toISOString()
        });
        
        return res.status(500).json({
          success: false,
          message: 'Interner Serverfehler. Bitte versuchen Sie es später erneut.',
          code: 'TOKEN_GENERATION_ERROR',
          timestamp: new Date().toISOString()
        });
      }

      console.log('Login successful, preparing response', {
        userId: customer.id,
        email: customer.email,
        timestamp: new Date().toISOString()
      });
      
      // Prepare user data for response
      const userData = {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        customerNumber: customer.customerNumber,
        role: 'sales_rep',
        contextToken: loginResponse.contextToken
      };
      
      // Log the response (without sensitive data)
      console.log('Sending login response', {
        success: true,
        user: {
          ...userData,
          contextToken: '***REDACTED***'
        },
        token: token ? '***JWT_TOKEN***' : 'MISSING',
        timestamp: new Date().toISOString()
      });
      
      // Set response headers
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      
      // Return token and user data
      return res.status(200).json({
        success: true,
        token,
        user: userData
      });
      
    } catch (error: any) {
      const timestamp = new Date().toISOString();
      const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      // Log the full error with request details
      console.error('Unexpected login error:', {
        errorId,
        timestamp,
        message: error.message,
        name: error.name,
        code: error.code,
        status: error.status,
        statusCode: error.statusCode,
        response: error.response,
        request: {
          method: req.method,
          url: req.originalUrl,
          headers: req.headers,
          body: { 
            ...req.body, 
            password: req.body.password ? '***REDACTED***' : undefined 
          },
          query: req.query,
          params: req.params,
          ip: req.ip,
          ips: req.ips,
          hostname: req.hostname,
          protocol: req.protocol,
          secure: req.secure,
          subdomains: req.subdomains
        },
        stack: error.stack
      });
      
      // Determine status code
      let statusCode = 500;
      if (error.status && typeof error.status === 'number') {
        statusCode = error.status;
      } else if (error.statusCode && typeof error.statusCode === 'number') {
        statusCode = error.statusCode;
      } else if (error.response?.status) {
        statusCode = error.response.status;
      }
      
      // Determine error message
      let errorMessage = 'Ein unerwarteter Fehler ist aufgetreten';
      if (error.message) {
        errorMessage = error.message;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.errors?.[0]?.detail) {
        errorMessage = error.response.data.errors[0].detail;
      }
      
      // Determine error code
      let errorCode = 'UNKNOWN_ERROR';
      if (error.code) {
        errorCode = error.code;
      } else if (error.response?.data?.code) {
        errorCode = error.response.data.code;
      } else if (error.response?.data?.errors?.[0]?.code) {
        errorCode = error.response.data.errors[0].code;
      }
      
      // Send error response
      return res.status(statusCode).json({
        success: false,
        message: errorMessage,
        code: errorCode,
        errorId,
        timestamp
      });
    }
  };
  
  // Register both login routes for backward compatibility
  app.post('/api/login', handleLogin);
  app.post('/store-api/account/login', handleLogin);

  // Define interfaces for logout
  interface LogoutResponseData {
    success: boolean;
    message?: string;
    code?: string;
    errorId?: string;
    timestamp?: string;
  }

  // Logout route
  app.post('/api/auth/logout', auth, async (req: AuthRequest, res: Response<LogoutResponseData>) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    console.log('Logout request received', {
      userId: req.user?.id,
      timestamp,
      headers: req.headers,
      ip: req.ip
    });
    
    try {
      if (req.user?.contextToken) {
        console.log('Logging out user with context token', {
          userId: req.user.id,
          tokenPrefix: req.user.contextToken ? `${req.user.contextToken.substring(0, 10)}...` : 'MISSING',
          timestamp
        });
        
        const logoutSuccess = await logoutCustomer(req.user.contextToken);
        
        if (!logoutSuccess) {
          console.warn('Logout may not have been fully processed on the Shopware side', {
            userId: req.user.id,
            timestamp
          });
        }
      } else {
        console.log('No context token found for user, skipping Shopware logout', {
          userId: req.user?.id,
          timestamp
        });
      }
      
      // Clear any client-side tokens
      res.setHeader('Clear-Site-Data', '"cookies", "storage"');
      
      console.log('Logout successful', {
        userId: req.user?.id,
        timestamp
      });
      
      return res.status(200).json({ 
        success: true, 
        message: 'Erfolgreich abgemeldet',
        timestamp
      });
      
    } catch (error: any) {
      console.error('Logout error:', {
        errorId,
        message: error.message,
        stack: error.stack,
        userId: req.user?.id,
        timestamp
      });
      
      // Even if logout fails, we still want to clear the client-side session
      res.setHeader('Clear-Site-Data', '"cookies", "storage"');
      
      return res.status(500).json({ 
        success: false, 
        message: 'Fehler beim Abmelden. Ihre Sitzung wurde lokal gelöscht, aber möglicherweise nicht auf dem Server.',
        code: 'LOGOUT_ERROR',
        errorId,
        timestamp
      });
    }
  });

  // Define interfaces for /me endpoint
  interface MeResponseData {
    success: boolean;
    user?: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      customerNumber: string;
      role: string;
    };
    message?: string;
    code?: string;
    errorId?: string;
    timestamp?: string;
  }

  // Get current user
  app.get('/api/auth/me', auth, async (req: AuthRequest, res: Response<MeResponseData>) => {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    console.log('Me request received', {
      userId: req.user?.id,
      timestamp,
      headers: req.headers,
      ip: req.ip
    });
    
    try {
      if (!req.user) {
        console.warn('Unauthorized access to /api/auth/me', { 
          timestamp,
          headers: req.headers,
          ip: req.ip
        });
        
        return res.status(401).json({ 
          success: false, 
          message: 'Nicht autorisiert',
          code: 'UNAUTHORIZED',
          errorId,
          timestamp
        });
      }
      
      // Log successful response (without sensitive data)
      console.log('Returning user data', {
        userId: req.user.id,
        email: req.user.email,
        role: req.user.role,
        timestamp
      });
      
      return res.status(200).json({ 
        success: true, 
        user: {
          id: req.user.id,
          email: req.user.email,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          customerNumber: req.user.customerNumber,
          role: req.user.role,
          // Don't include sensitive data like tokens in the response
        }
      });
      
    } catch (error: any) {
      console.error('Error in /api/auth/me:', {
        errorId,
        message: error.message,
        stack: error.stack,
        userId: req.user?.id,
        timestamp
      });
      
      return res.status(500).json({
        success: false,
        message: 'Ein Fehler ist aufgetreten beim Abrufen der Benutzerdaten',
        code: 'ME_ERROR',
        errorId,
        timestamp
      });
    }
  });

  // Socket.IO types are now imported from ./types/socket.types.ts

  // Create HTTP server
  const httpServer = createServer(app);
  
  // Setup Socket.IO with TypeScript types
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });
  
  // Type assertion to our custom type
  const typedIo = io as unknown as CustomSocketIOServer;

  // Socket.IO authentication middleware with proper typing
  io.use(async (socket: CustomSocket, next) => {
    const auth = socket.handshake.auth as SocketAuthData;
    const token = auth.token || 
                 (socket.handshake.headers.authorization || '').split(' ')[1];
    
    if (!token) {
      console.error('Socket connection rejected: No token provided');
      return next(new Error('Authentication error: No token provided'));
    }
    
    try {
      // Verify token and attach user to socket
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as SocketUserData;
      // Initialize socket.data if it doesn't exist
      if (!socket.data) {
        socket.data = { user: null };
      }
      socket.data.user = decoded;
      socket.user = decoded; // Also set on socket.user for backward compatibility
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Socket.IO event interfaces are now defined in ./types/socket.types.ts

  // Socket.IO connection handler with proper typing
  io.on('connection', (socket: CustomSocket) => {
    // Access the user data from socket.data or socket.user
    const user = socket.data?.user || socket.user;
    
    if (user) {
      console.log('New client connected', { 
        userId: user.id,
        email: user.email,
        customerNumber: user.customerNumber,
        role: user.role,
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });
      
      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log('Client disconnected', {
          userId: user.id,
          socketId: socket.id,
          reason,
          timestamp: new Date().toISOString()
        });
      });
      
      // Handle errors
      socket.on('error', (error) => {
        console.error('Socket error:', {
          userId: user.id,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
      });
      
      // Example of handling a custom event
      // socket.on('customEvent', (data: CustomEventData) => {
      //   console.log('Received custom event:', { data, userId: user.id });
      //   // Handle the event
      // });
    } else {
      console.warn('Client connected without authentication', {
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });
      
      // Disconnect unauthenticated clients
      socket.disconnect(true);
    }
  });

  // Return both the HTTP server and the typed Socket.IO instance
  return { httpServer, io: typedIo } as const;
}
