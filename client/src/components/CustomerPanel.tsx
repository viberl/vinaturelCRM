import { X, Euro, ShoppingCart } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Customer } from "@shared/schema";

interface CustomerPanelProps {
  customer: Customer;
  onClose: () => void;
}

export default function CustomerPanel({ customer, onClose }: CustomerPanelProps) {
  const getStatusBadge = (status: string) => {
    const variants = {
      active: "bg-green-100 text-green-800",
      potential: "bg-orange-100 text-orange-800", 
      inactive: "bg-red-100 text-red-800"
    };
    return variants[status as keyof typeof variants] || variants.active;
  };

  return (
    <div className="w-96 bg-white shadow-lg border-l border-gray-200 overflow-y-auto">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Kundendetails</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="p-6 space-y-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-primary font-semibold">
              {customer.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </span>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900">{customer.name}</h4>
            <p className="text-sm text-gray-500">{customer.email}</p>
          </div>
        </div>
        
        <div className="border-t border-gray-200 pt-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Status</span>
              <Badge className={getStatusBadge(customer.status)}>
                {customer.status === 'active' ? 'Aktiv' : 
                 customer.status === 'potential' ? 'Potentiell' : 'Inaktiv'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Umsatz</span>
              <span className="text-sm font-medium text-gray-900">
                €{parseFloat(customer.totalRevenue || "0").toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Bestellungen</span>
              <span className="text-sm font-medium text-gray-900">{customer.orderCount}</span>
            </div>
          </div>
        </div>
        
        <div className="border-t border-gray-200 pt-4">
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
