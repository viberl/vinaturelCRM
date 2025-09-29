import { X, Euro, ShoppingCart } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MapCustomer } from "@shared/types/map-customer";

interface CustomerPanelProps {
  customer: MapCustomer;
  onClose: () => void;
}

export default function CustomerPanel({ customer, onClose }: CustomerPanelProps) {
  const getStatusBadge = (status: string) => {
    const variants = {
      active: "bg-primary/10 text-primary",
      potential: "bg-accent/10 text-accent", 
      inactive: "bg-muted text-muted-foreground"
    };
    return variants[status as keyof typeof variants] || variants.active;
  };

  return (
    <div className="w-96 bg-card text-card-foreground shadow-lg border-l border-border overflow-y-auto">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Kundendetails</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="p-6 space-y-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-primary font-semibold">
              {customer.name
                .split(' ')
                .filter(Boolean)
                .map((n) => n[0])
                .join('')
                .slice(0, 2) || 'NA'}
            </span>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">{customer.name}</h4>
            <p className="text-sm text-muted-foreground">{customer.email}</p>
          </div>
        </div>
        
        <div className="border-t border-border pt-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge className={getStatusBadge(customer.status)}>
                {customer.status === 'active' ? 'Aktiv' : 
                 customer.status === 'potential' ? 'Potentiell' : 'Inaktiv'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Umsatz</span>
              <span className="text-sm font-medium text-foreground">
                €{parseFloat(customer.totalRevenue ?? "0").toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Bestellungen</span>
              <span className="text-sm font-medium text-foreground">{customer.orderCount}</span>
            </div>
          </div>
        </div>
        
        <div className="border-t border-border pt-4">
          <Link href={`/customer/${customer.id}`}>
            <Button className="w-full">
              Vollständige Akte öffnen
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
