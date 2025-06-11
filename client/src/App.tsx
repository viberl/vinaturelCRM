import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MapView from "@/pages/MapView";
import CustomerDetail from "@/pages/CustomerDetail";
import Sidebar from "@/components/Sidebar";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/auth/LoginPage";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

function AppRoutes() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();

  // Handle redirects based on auth state
  useEffect(() => {
    if (user) {
      // If user is logged in and tries to access login page, redirect to dashboard
      if (location === '/login' || location === '/') {
        setLocation('/dashboard');
      }
    } else {
      // If user is not logged in and tries to access protected route, redirect to login
      if (location !== '/login') {
        setLocation('/login');
      }
    }
  }, [user, location, setLocation]);
  
  // Show loading state while checking auth
  if (user === undefined) {
    return <div className="flex items-center justify-center h-screen">Laden...</div>;
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route>
        <ProtectedRoute>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <Switch>
                <Route path="/dashboard" component={MapView} />
                <Route path="/map" component={MapView} />
                <Route path="/customer/:id" component={CustomerDetail} />
                <Route path="/">
                  {() => {
                    // This will be caught by the useEffect above
                    return null;
                  }}
                </Route>
                <Route component={NotFound} />
              </Switch>
            </div>
          </div>
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <AppRoutes />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
