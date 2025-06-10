import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { login, loading, error } = useAuth();
  const [location] = useLocation();
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    // Check for error in URL (e.g., if user denied access)
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    
    if (error) {
      setLoginError('Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.');
      // Clean up the URL
      window.history.replaceState({}, document.title, '/login');
    }
  }, [location]);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      // Direkte Weiterleitung zur Shopware-Login-Seite
      const shopwareLoginUrl = `${process.env.VITE_SHOPWARE_URL || 'https://vinaturel.de'}/account/login`;
      
      // Füge die Weiterleitungs-URL nach dem Login hinzu
      const redirectAfterLogin = `${window.location.origin}/api/auth/callback`;
      const loginUrl = new URL(shopwareLoginUrl);
      loginUrl.searchParams.append('redirectTo', redirectAfterLogin);
      
      // Führe die Weiterleitung durch
      window.location.href = loginUrl.toString();
    } catch (err) {
      console.error('Login error:', err);
      setLoginError('Anmeldung fehlgeschlagen. Bitte versuchen Sie es später erneut.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Willkommen beim Vinaturel CRM</CardTitle>
          <CardDescription className="text-center">
            Bitte melden Sie sich mit Ihrem Shopware 6 Konto an
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center space-y-6 py-8">
          <div className="text-center space-y-2">
            <h3 className="text-lg font-medium">Mit Shopware 6 anmelden</h3>
            <p className="text-sm text-muted-foreground">
              Sie werden zu Shopware weitergeleitet, um sich zu authentifizieren
            </p>
          </div>
          
          {(error || loginError) && (
            <div className="text-sm text-red-500 text-center max-w-xs">
              {error || loginError}
            </div>
          )}
          
          <Button 
            onClick={handleLogin} 
            className="w-full max-w-xs" 
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wird weitergeleitet...
              </>
            ) : (
              'Mit Shopware anmelden'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
