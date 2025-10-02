import React, { useMemo } from "react";
import { Link, useLocation } from "wouter";
import {
  Map,
  Users,
  BarChart3,
  CheckSquare,
  Settings,
  LogOut,
  LayoutDashboard,
  Wine,
  X,
  Briefcase,
  Building2,
  MessageCircle,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type NavigationItem = {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  isChild?: boolean;
};

const baseNavigation: NavigationItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Kunden-Karte", href: "/map", icon: Map },
  { name: "Kundenliste", href: "/customers", icon: Users },
  { name: "Sortiment", href: "/sortiment", icon: Wine },
  { name: "Auswertungen", href: "/auswertungen", icon: BarChart3 },
  { name: "Aufgaben", href: "/tasks", icon: CheckSquare },
  { name: "Mitarbeiter-Portal", href: "/mitarbeiter-portal", icon: Briefcase },
  { name: "Team-Chat", href: "/team-chat", icon: MessageCircle },
];
interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  unreadTeamChatCount?: number;
}

export default function Sidebar({
  isOpen,
  onClose,
  unreadTeamChatCount = 0,
}: SidebarProps) {
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
  const profileImage = user?.profileImageUrl ?? null;

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setLocation('/login');
    }
  };

  const navigationItems = useMemo(() => {
    const items = [...baseNavigation];

    if (user?.role?.toLowerCase() === 'management') {
      const managementItem: NavigationItem = {
        name: "Management Board",
        href: "/management-board",
        icon: Building2,
      };

      return [managementItem, ...items];
    }

    return items;
  }, [user?.role]);

  const roleLabel = useMemo(() => {
    const normalized = user?.role?.toLowerCase();
    switch (normalized) {
      case 'innendienst':
        return 'Innendienst';
      case 'management':
        return 'Management';
      default:
        return 'Sales Manager';
    }
  }, [user?.role]);

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
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isManagementItem = item.href === "/management-board";
          const isTeamChatItem = item.href === "/team-chat";
          const isActive =
            location === item.href ||
            location.startsWith(`${item.href}?`) ||
            (item.href === "/map" && (location === "/" || location.startsWith('/map')));
          const shouldShowBadge = isTeamChatItem && unreadTeamChatCount > 0;
          const badgeLabel = unreadTeamChatCount > 99 ? "99+" : unreadTeamChatCount;
          
          return (
            <Link key={item.name} href={item.href}>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-between",
                  isManagementItem
                    ? "font-semibold text-accent-500 hover:bg-accent/15 hover:text-accent-600"
                    : "text-foreground hover:bg-muted hover:text-foreground",
                  isActive &&
                    (isManagementItem
                      ? "bg-accent/20 text-accent-600 border-r-2 border-[var(--accent-500)]"
                      : "bg-primary/10 text-primary border-r-2 border-primary"),
                  item.isChild && "pl-10 text-sm"
                )}
                onClick={handleItemClick}
              >
                <span className="flex items-center">
                  <Icon
                    className={cn(
                      "mr-3 h-5 w-5",
                      isManagementItem && !isActive && "text-accent-500",
                      isManagementItem && isActive && "text-accent-600"
                    )}
                  />
                  {item.name}
                </span>
                {shouldShowBadge && (
                  <span className="ml-3 flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[#F37C20] px-1 text-xs font-semibold text-white">
                    {badgeLabel}
                  </span>
                )}
              </Button>
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-3">
          <Avatar className="h-9 w-9">
            {profileImage ? (
              <AvatarImage src={profileImage} alt={displayName} />
            ) : (
              <AvatarFallback>{initials || 'NN'}</AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {displayName}
            </p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
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
                  setLocation('/account');
                  onClose();
                }}
              >
                <UserCog className="mr-2 h-4 w-4" />
                Mein Konto
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
