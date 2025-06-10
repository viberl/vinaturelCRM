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
  const [location] = useLocation();

  // If we're on the login page and user is already logged in, redirect to home
  if (location === '/login' && user) {
    window.location.href = '/';
    return null;
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
                <Route path="/" component={MapView} />
                <Route path="/map" component={MapView} />
                <Route path="/customer/:id" component={CustomerDetail} />
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
