import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    customerNumber: string;
    role: string;
    contextToken?: string;
  };
}

/**
 * Middleware to authenticate requests using JWT token
 */
export const auth = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ 
        success: false, 
        message: 'Kein Authentifizierungstoken gefunden' 
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Ungültiges Token-Format' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Add user to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      firstName: decoded.firstName || '',
      lastName: decoded.lastName || '',
      customerNumber: decoded.customerNumber || '',
      role: decoded.role || 'customer',
      contextToken: decoded.contextToken
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
 * Generate a JWT token for the user
 */
export const generateToken = (userData: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  customerNumber: string;
  role: string;
  contextToken?: string;
}): string => {
  const payload = {
    id: userData.id,
    email: userData.email,
    firstName: userData.firstName,
    lastName: userData.lastName,
    customerNumber: userData.customerNumber,
    role: userData.role,
    contextToken: userData.contextToken
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
