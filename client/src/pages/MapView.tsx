import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { Icon } from "leaflet";
import TopBar from "@/components/TopBar";
import CustomerPanel from "@/components/CustomerPanel";
import type { Customer } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import "leaflet/dist/leaflet.css";

// Fix for default markers in react-leaflet
delete (Icon.Default.prototype as any)._getIconUrl;
Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createCustomIcon = (status: string) => {
  const color = status === 'active' ? '#22c55e' : 
               status === 'potential' ? '#f59e0b' : '#ef4444';
  
  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="25" height="41">
        <path fill="${color}" stroke="#fff" stroke-width="2" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle fill="#fff" cx="12" cy="9" r="3"/>
      </svg>
    `)}`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
};

export default function MapView() {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [filters, setFilters] = useState({
    active: true,
    potential: true,
    inactive: false
  });

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const filteredCustomers = customers.filter(customer => 
    filters[customer.status as keyof typeof filters]
  );

  const stats = {
    activeCustomers: customers.filter(c => c.status === 'active').length,
    potentialCustomers: customers.filter(c => c.status === 'potential').length,
    inactiveCustomers: customers.filter(c => c.status === 'inactive').length,
  };

  return (
    <>
      <TopBar title="Kunden-Karte" />
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex">
          {/* Map Container */}
          <div className="flex-1 relative">
            {isLoading ? (
              <div className="h-full w-full flex items-center justify-center bg-gray-100">
                <div className="text-gray-500">Karte wird geladen...</div>
              </div>
            ) : (
              <MapContainer
                center={[49.9725, 8.2644]}
                zoom={10}
                className="h-full w-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {filteredCustomers.map((customer) => (
                  customer.lat && customer.lng ? (
                    <Marker
                      key={customer.id}
                      position={[parseFloat(customer.lat), parseFloat(customer.lng)]}
                      icon={createCustomIcon(customer.status)}
                    >
                      <Popup>
                        <div className="p-2">
                          <h3 className="font-semibold text-gray-900">{customer.name}</h3>
                          <p className="text-sm text-gray-600">{customer.address}</p>
                          <p className="text-sm text-gray-600">
                            Status: <span className="font-medium capitalize">{customer.status}</span>
                          </p>
                          <button 
                            className="mt-2 px-3 py-1 bg-primary text-primary-foreground text-sm rounded hover:bg-primary/90"
                            onClick={() => setSelectedCustomer(customer)}
                          >
                            Details anzeigen
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  ) : null
                ))}
              </MapContainer>
            )}

            {/* Map Controls */}
            <Card className="absolute top-4 right-4 p-4 space-y-3 z-[1000] w-48">
              <div className="text-sm font-medium text-gray-900">Filter</div>
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <Checkbox
                    checked={filters.active}
                    onCheckedChange={(checked) => 
                      setFilters(prev => ({ ...prev, active: !!checked }))
                    }
                  />
                  <span className="text-sm text-gray-700">Aktive Kunden</span>
                </label>
                <label className="flex items-center space-x-2">
                  <Checkbox
                    checked={filters.potential}
                    onCheckedChange={(checked) => 
                      setFilters(prev => ({ ...prev, potential: !!checked }))
                    }
                  />
                  <span className="text-sm text-gray-700">Potentielle Kunden</span>
                </label>
                <label className="flex items-center space-x-2">
                  <Checkbox
                    checked={filters.inactive}
                    onCheckedChange={(checked) => 
                      setFilters(prev => ({ ...prev, inactive: !!checked }))
                    }
                  />
                  <span className="text-sm text-gray-700">Inaktive Kunden</span>
                </label>
              </div>
            </Card>

            {/* Customer Stats */}
            <Card className="absolute bottom-4 left-4 p-4 z-[1000]">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-primary">{stats.activeCustomers}</div>
                  <div className="text-xs text-gray-500">Aktive</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-accent-500">{stats.potentialCustomers}</div>
                  <div className="text-xs text-gray-500">Potentiell</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-400">{stats.inactiveCustomers}</div>
                  <div className="text-xs text-gray-500">Inaktiv</div>
                </div>
              </div>
            </Card>
          </div>

          {/* Customer Details Panel */}
          {selectedCustomer && (
            <CustomerPanel 
              customer={selectedCustomer} 
              onClose={() => setSelectedCustomer(null)} 
            />
          )}
        </div>
      </main>
    </>
  );
}
