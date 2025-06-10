import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  MapPin, 
  Users, 
  Settings, 
  BarChart3,
  Bell,
  Search
} from "lucide-react";
import { Link, useLocation } from "wouter";
import ShopwareSync from "./ShopwareSync";

const navigation = [
  { name: "Kunden-Karte", href: "/map", icon: MapPin },
  { name: "Kundenliste", href: "/customers", icon: Users },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Aufgaben", href: "/tasks", icon: CheckSquare },
  { name: "Einstellungen", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="w-64 bg-white shadow-lg flex flex-col">
      {/* Logo and Brand */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Wine className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Vinaturel</h1>
            <p className="text-sm text-gray-500">CRM System</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || (item.href === "/map" && location === "/");

          return (
            <Link key={item.name} href={item.href}>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start",
                  isActive && "bg-primary/10 text-primary border-r-2 border-primary"
                )}
              >
                <Icon className="mr-3 h-5 w-5" />
                {item.name}
              </Button>
            </Link>
          );
        })}
      </nav>
        </div>

        {/* Shopware Integration */}
        <div className="px-3 py-2 border-t">
          <ShopwareSync />
        </div>
      </ScrollArea>
    </div>
  );
}