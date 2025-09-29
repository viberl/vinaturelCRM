import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  customerNumber?: string | null;
  salesRepEmail?: string | null;
  salesRepId?: string | null;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

/**
 * Middleware to authenticate requests using JWT token
 */
export const auth = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Kein Authentifizierungstoken gefunden'
      });
    }

    const token = authorization.split(' ')[1];

    const decoded = jwt.verify(token, JWT_SECRET) as Partial<AuthUser>;

    if (!decoded.id || !decoded.email) {
      throw new Error('Token ohne Benutzerinformationen');
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role || 'sales_rep',
      firstName: decoded.firstName ?? null,
      lastName: decoded.lastName ?? null,
      customerNumber: decoded.customerNumber ?? null,
      salesRepEmail: decoded.salesRepEmail ?? null,
      salesRepId: decoded.salesRepId ?? null
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Sitzung abgelaufen. Bitte melden Sie sich erneut an.' 
      });
    }
    
    res.status(401).json({ 
      success: false, 
      message: 'Ungültige Sitzung. Bitte melden Sie sich erneut an.' 
    });
  }
};

/**
 * Middleware to check if user has admin role
 */
export const adminAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  auth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Zugriff verweigert. Administratorrechte erforderlich.' 
      });
    }
    next();
  });
};

/**
 * Create an Express router for authentication routes
 */
export function createAuthRouter() {
  const router = require('express').Router();
  
  // Add authentication routes here if needed
  // Example:
  // router.post('/login', loginHandler);
  // router.post('/refresh-token', refreshTokenHandler);
  
  return router;
}

/**
 * Generate a JWT token for the user
 */
export const generateToken = (userData: AuthUser): string => {
  const payload: Partial<AuthUser> = {
    id: userData.id,
    email: userData.email,
    role: userData.role,
    firstName: userData.firstName ?? null,
    lastName: userData.lastName ?? null,
    customerNumber: userData.customerNumber ?? null,
    salesRepEmail: userData.salesRepEmail ?? null,
    salesRepId: userData.salesRepId ?? null
  };
  
  // Handle different expiresIn formats
  const signOptions: SignOptions = {};
  
  // Check if JWT_EXPIRES_IN is a numeric string
  if (/^\d+$/.test(JWT_EXPIRES_IN)) {
    signOptions.expiresIn = parseInt(JWT_EXPIRES_IN, 10);
  } else {
    // Use as string (e.g., '1h', '7d', '30d')
    signOptions.expiresIn = JWT_EXPIRES_IN as unknown as number; // Type assertion needed
  }
  
  return jwt.sign(payload, JWT_SECRET, signOptions);
};
