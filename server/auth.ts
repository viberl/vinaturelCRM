import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import qs from 'qs';
import session from 'express-session';

declare module 'express-session' {
  interface SessionData {
    state?: string;
    'sw-context-token'?: string;
  }
}

export function createAuthRouter() {
  const router = Router();
  
  // Shopware 6 API configuration
  const SHOPWARE_URL = process.env.SHOPWARE_URL || 'https://vinaturel.de';
  const SHOPWARE_ACCESS_KEY = process.env.SHOPWARE_ACCESS_KEY || '';
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  const JWT_EXPIRES_IN = '7d';

  // Get OAuth authorization URL (kept for reference, not used in current flow)
  router.get('/oauth/url', (req, res) => {
    const redirectUri = `${process.env.CLIENT_URL}/api/auth/callback`;
    const url = new URL(`${process.env.SHOPWARE_URL}/oauth/authorize`);
    
    url.searchParams.append('client_id', process.env.SHOPWARE_CLIENT_ID || '');
    url.searchParams.append('redirect_uri', redirectUri);
    url.searchParams.append('response_type', 'code');
    url.searchParams.append('scope', 'write');
    
    res.json({ url: url.toString() });
  });

  // Login endpoint - redirects to Shopware customer login
  router.get('/login', (req, res) => {
    // Check if we're coming from a redirect from Shopware
    if (req.query.redirectFromShopware) {
      // This is the callback from Shopware after login
      // Extract the context token from cookies
      const cookies = req.headers.cookie || '';
      const contextTokenMatch = cookies.match(/context-token=([^;]+)/);
      const contextToken = contextTokenMatch ? contextTokenMatch[1] : null;
      
      if (contextToken) {
        // We have a valid context token, redirect to the frontend with the token
        return res.redirect(`${process.env.CLIENT_URL}/?token=${contextToken}`);
      } else {
        // No context token found, redirect back to login with error
        return res.redirect(`${process.env.CLIENT_URL}/login?error=no_token`);
      }
    }
    
    // This is the initial login request
    // Generate a random state parameter for CSRF protection
    const state = Math.random().toString(36).substring(2, 15);
    
    // Store the state in the session
    req.session!.state = state;
    
    // Build the login URL with redirect back to our callback
    const redirectUri = `${process.env.CLIENT_URL}/api/auth/callback`;
    console.log('Using callback URL:', redirectUri);
    
    // Create a session-specific redirect URL that includes our state
    const sessionRedirectUri = `${process.env.CLIENT_URL}/api/auth/verify?state=${state}`;
    
    // Create the login URL with a special parameter to prevent default redirect
    const loginUrl = new URL(`${process.env.SHOPWARE_URL}/account/login`);
    
    // Add redirect parameter to come back to our verify endpoint after login
    // The 'redirectTo' parameter is used by Shopware for post-login redirect
    // We also add 'redirected' to prevent any default redirects
    loginUrl.searchParams.append('redirectTo', sessionRedirectUri);
    loginUrl.searchParams.append('redirected', '1');
    
    // Force the redirect to our verify endpoint after login
    loginUrl.searchParams.append('redirect', sessionRedirectUri);
    
    console.log('Full login URL:', loginUrl.toString());
    
    // Instead of using the verify endpoint, we'll let Shopware redirect back to us
    // with a special parameter that indicates this is coming from Shopware
    const finalRedirectUri = `${process.env.SHOPWARE_URL}/account/login?redirectTo=${encodeURIComponent(`${process.env.CLIENT_URL}/api/auth/login?redirectFromShopware=true`)}`;
    
    console.log('Final redirect URL:', finalRedirectUri);
    res.redirect(finalRedirectUri);
  });
  
  // Verify endpoint after Shopware login
  router.get('/verify', (req: Request, res: Response) => {
    console.log('\n=== VERIFY ENDPOINT HIT ===');
    console.log('Query params:', req.query);
    console.log('Cookies:', req.headers.cookie);
    const { state } = req.query;
    const sessionState = req.session?.state;
    
    console.log('\n=== VERIFY CALLBACK ===');
    console.log('State from query:', state);
    console.log('State from session:', sessionState);
    
    // Verify state to prevent CSRF
    if (!state || state !== sessionState) {
      console.error('Invalid state parameter');
      return res.status(400).json({ message: 'Invalid state parameter' });
    }
    
    // At this point, we know the user is authenticated with Shopware
    // Now we need to get the context token from the cookies
    const cookies = req.headers.cookie || '';
    const contextTokenMatch = cookies.match(/context-token=([^;]+)/);
    const contextToken = contextTokenMatch ? contextTokenMatch[1] : null;
    
    console.log('Context token from cookies:', contextToken);
    
    if (!contextToken) {
      console.error('No context token found in cookies');
      return res.redirect(`${process.env.CLIENT_URL}/login?error=no_token`);
    }
    
    // Store the context token in the session
    req.session!['sw-context-token'] = contextToken;
    
    // Redirect to the frontend with the token
    res.redirect(`${process.env.CLIENT_URL}/?token=${contextToken}`);
  });

  // Callback endpoint after Shopware login
  router.get('/callback', async (req: Request, res: Response) => {
    console.log('\n=== CALLBACK RECEIVED ===');
    console.log('Headers:', req.headers);
    console.log('Query params:', req.query);
    console.log('Cookies:', req.cookies);
    console.log('Session ID:', req.sessionID);
    console.log('Session data:', req.session);
    
    // Get state from query and session
    const state = req.query.state as string | undefined;
    const contextToken = req.query['sw-context-token'] as string | undefined;
    const sessionState = req.session?.state;
    
    console.log('State from query:', state);
    console.log('State from session:', sessionState);
    console.log('Context token from query:', contextToken);
    
    // Verify state to prevent CSRF
    if (!state || state !== sessionState) {
      console.error('Invalid state parameter. Expected:', sessionState, 'Got:', state);
      return res.status(400).json({ message: 'Invalid state parameter' });
    }
    
    // Get the context token from query parameters (set by Shopware after login)
    const finalContextToken = contextToken || req.session?.['sw-context-token'];
    
    if (!finalContextToken) {
      console.error('No context token found in session or query parameters');
      return res.status(401).json({ message: 'No active session found' });
    }
    
    try {
      // Get customer info using the context token
      const response = await axios.get(`${process.env.SHOPWARE_URL}/store-api/account/customer`, {
        headers: {
          'sw-context-token': finalContextToken,
          'sw-access-key': process.env.SHOPWARE_ACCESS_KEY || '',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      const customer = response.data;
      
      // Check if customer has required role (e.g., is a sales rep)
      // You'll need to implement this based on your customer group setup
      const isSalesRep = customer?.group?.name === 'Außendienstmitarbeiter'; // Adjust this condition
      
      if (!isSalesRep) {
        return res.status(403).json({ message: 'Access denied. Sales rep access required.' });
      }
      
      // Create JWT token for our app
      const token = jwt.sign(
        { 
          id: customer.id, 
          email: customer.email,
          name: `${customer.firstName} ${customer.lastName}`,
          isSalesRep: true
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      // Redirect back to frontend with token
      const redirectUrl = new URL(process.env.CLIENT_URL || '');
      redirectUrl.searchParams.append('token', token);
      
      res.redirect(redirectUrl.toString());

    } catch (error: any) {
      console.error('OAuth callback error:', error.response?.data || error.message);
      res.status(401).json({
        message: 'Authentication failed. Please try again.',
        error: error.response?.data || error.message,
      });
    }
  });

  // Get current user endpoint
  router.get('/me', (req, res) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      res.json(decoded);
    } catch (error) {
      res.status(401).json({ message: 'Invalid or expired token' });
    }
  });

  return router;
}
