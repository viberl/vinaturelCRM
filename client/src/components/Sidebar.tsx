import { Link, useLocation } from "wouter";
import { Map, Users, BarChart3, CheckSquare, Settings, LogOut, LayoutDashboard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Kunden-Karte", href: "/map", icon: Map },
  { name: "Kundenliste", href: "/customers", icon: Users },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Aufgaben", href: "/tasks", icon: CheckSquare },
  { name: "Einstellungen", href: "/settings", icon: Settings },
];
interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const displayName = user?.firstName || user?.lastName
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
    : user?.name || user?.email || 'Benutzer';

  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setLocation('/login');
    }
  };

  const handleItemClick = () => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      return;
    }
    onClose();
  };

  return (
    <div
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-card text-card-foreground shadow-lg transition-transform duration-200 md:static md:translate-x-0 md:border-r md:border-border",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-3 top-3 text-foreground hover:text-foreground md:hidden"
        onClick={onClose}
        aria-label="Menü schließen"
      >
        <X className="h-5 w-5" />
      </Button>
      {/* Logo and Brand */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <img
            src="/VinaturelLogo.png"
            alt="Vinaturel Logo"
            className="h-12 w-12 object-contain"
          />
          <div>
            <h1 className="text-xl font-bold text-primary">Vinaturel</h1>
            <p className="text-sm text-muted-foreground">CRM System</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive =
            location === item.href ||
            location.startsWith(`${item.href}?`) ||
            (item.href === "/map" && (location === "/" || location.startsWith('/map')));
          
          return (
            <Link key={item.name} href={item.href}>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start text-foreground hover:bg-muted hover:text-foreground",
                  isActive && "bg-primary/10 text-primary border-r-2 border-primary"
                )}
                onClick={handleItemClick}
              >
                <Icon className="mr-3 h-5 w-5" />
                {item.name}
              </Button>
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-secondary/20 text-secondary rounded-full flex items-center justify-center">
            <span className="text-xs font-semibold">{initials || 'NN'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {displayName}
            </p>
            <p className="text-xs text-muted-foreground">Sales Manager</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  handleLogout();
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Abmelden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
