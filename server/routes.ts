import { Express, Request, Response, NextFunction, json } from "express";
import { createServer, Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { storage } from "./storage";
import { insertCustomerSchema, insertInteractionSchema } from "@shared/schema";
import cors from "cors";
import dotenv from "dotenv";
import { 
  loginCustomer, 
  getCurrentCustomer, 
  logoutCustomer, 
  LoginResponse, 
  CustomerData 
} from "./shopware";
import { auth, AuthRequest, generateToken } from "./auth";

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

export async function registerRoutes(app: Express): Promise<HttpServer> {
  // Enable CORS
  app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  }));

  // Parse JSON bodies
  app.use(json());

  // Auth routes
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      console.log('Login request received:', { email: req.body.email });
      const { email, password } = req.body;
      
      if (!email || !password) {
        console.log('Missing email or password');
        return res.status(400).json({ 
          success: false, 
          message: 'E-Mail und Passwort werden benötigt' 
        });
      }

      try {
        // Login to Shopware
        console.log('Attempting to login to Shopware...');
        const loginResponse = await loginCustomer(email, password);
        console.log('Shopware login successful, context token received');
        
        // Get customer data
        console.log('Fetching customer data...');
        const customer = await getCurrentCustomer(loginResponse.contextToken);
        console.log('Customer data received:', { 
          id: customer.id, 
          email: customer.email,
          group: customer.group?.name
        });

        // Check if user is a sales rep
        const isSalesRep = customer.group?.name === 'Außendienstmitarbeiter';
        
        if (!isSalesRep) {
          console.log('Access denied: User is not a sales rep');
          return res.status(403).json({
            success: false,
            message: 'Zugriff verweigert. Sie benötigen Verkäuferrechte.'
          });
        }

        // Generate JWT token using the helper function
        console.log('Generating JWT token...');
        const token = generateToken({
          id: customer.id,
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          customerNumber: customer.customerNumber,
          role: 'sales_rep',
          contextToken: loginResponse.contextToken
        });

        console.log('Login successful, returning response');
        // Return token and user data
        res.json({
          success: true,
          token,
          user: {
            id: customer.id,
            email: customer.email,
            firstName: customer.firstName,
            lastName: customer.lastName,
            customerNumber: customer.customerNumber,
            role: 'sales_rep',
            contextToken: loginResponse.contextToken
          }
        });
      } catch (shopwareError: any) {
        console.error('Shopware API error:', shopwareError);
        throw shopwareError;
      }
    } catch (error: any) {
      console.error('Login error details:', {
        message: error.message,
        response: error.response?.data,
        stack: error.stack
      });
      
      const statusCode = error.response?.status || 500;
      const errorMessage = error.response?.data?.message || 
                         error.response?.data?.errors?.[0]?.detail || 
                         'Anmeldung fehlgeschlagen. Bitte versuchen Sie es später erneut.';
      
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Anmeldung fehlgeschlagen. Bitte überprüfen Sie Ihre Anmeldedaten.'
      });
    }
  });

  // Logout route
  app.post('/api/auth/logout', auth, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.contextToken) {
        await logoutCustomer(req.user.contextToken);
      }
      
      res.json({ success: true, message: 'Erfolgreich abgemeldet' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Fehler beim Abmelden' 
      });
    }
  });

  // Get current user
  app.get('/api/auth/me', auth, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          success: false, 
          message: 'Nicht autorisiert' 
        });
      }
      
      res.json({ 
        success: true, 
        user: req.user 
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Fehler beim Abrufen der Benutzerdaten' 
      });
    }
  });

  // Existing routes...
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST']
    }
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log('New client connected');
    
    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });

  return httpServer;
}
