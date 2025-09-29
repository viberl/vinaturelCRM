import { useEffect, useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/Dashboard";
import MapView from "@/pages/MapView";
import CustomersPage from "@/pages/CustomersPage";
import TasksPage from "@/pages/TasksPage";
import CustomerDetail from "@/pages/CustomerDetail";
import CustomerInteractionCategory from "@/pages/CustomerInteractionCategory";
import Sidebar from "@/components/Sidebar";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/auth/LoginPage";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

function AppRoutes() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
            {isSidebarOpen && (
              <div
                className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
                onClick={() => setIsSidebarOpen(false)}
                aria-hidden
              />
            )}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-3 md:hidden">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsSidebarOpen(true)}
                  aria-label="Menü öffnen"
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <span className="text-sm font-medium text-foreground">Menü</span>
              </div>
              <Switch>
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/map" component={MapView} />
                <Route path="/customers" component={CustomersPage} />
                <Route path="/customer/:id" component={CustomerDetail} />
                <Route path="/tasks" component={TasksPage} />
                <Route
                  path="/customer/:id/interaction/:category"
                  component={CustomerInteractionCategory}
                />
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
