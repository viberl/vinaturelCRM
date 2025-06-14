import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MapView from "@/pages/MapView";
import CustomerDetail from "@/pages/CustomerDetail";
import Login from "@/pages/Login";
import Sidebar from "@/components/Sidebar";
import NotFound from "@/pages/not-found";
import { useCurrentUser } from "./hooks/use-current-user";

function Router() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) return null;

  if (!user) {
    return <Login />;
  }

  return (
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
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
