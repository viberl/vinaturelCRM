import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { Icon, LatLngTuple } from "leaflet";
import 'leaflet/dist/leaflet.css';

// Fix for default markers in react-leaflet
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';

import TopBar from "@/components/TopBar";
import CustomerPanel from "@/components/CustomerPanel";
import type { MapCustomer } from "@shared/types/map-customer";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import api from "@/lib/api";

// Fix for default markers in react-leaflet
delete (Icon.Default.prototype as any)._getIconUrl;
Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createCustomIcon = (status: string) => {
  const color = status === 'active'
    ? '#274E37'
    : status === 'potential'
    ? '#e65b2d'
    : '#959998';
  
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
  const [selectedCustomer, setSelectedCustomer] = useState<MapCustomer | null>(null);
  const [filters, setFilters] = useState({
    active: true,
    potential: true,
    inactive: false
  });

  const { data: customers = [], isLoading } = useQuery<MapCustomer[]>({
    queryKey: ["/admin-api/search/customer"],
    queryFn: async () => {
      const response = await api.get("/admin-api/search/customer");
      return response.data;
    },
    retry: 1,
  });

  const filteredCustomers = customers.filter(customer => 
    filters[customer.status as keyof typeof filters]
  );

  const stats = {
    activeCustomers: customers.filter(c => c.status === 'active').length,
    potentialCustomers: customers.filter(c => c.status === 'potential').length,
    inactiveCustomers: customers.filter(c => c.status === 'inactive').length,
  };

  const center: LatLngTuple = [49.9725, 8.2644];
  const zoom = 10;

  return (
    <>
      <TopBar title="Kunden-Karte" />
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex">
          {/* Map Container */}
          <div className="flex-1 relative">
            {isLoading ? (
              <div className="h-full w-full flex items-center justify-center bg-muted">
                <div className="text-muted-foreground">Karte wird geladen...</div>
              </div>
            ) : (
              <MapContainer
                center={center}
                zoom={zoom}
                className="h-full w-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {filteredCustomers
                  .filter(customer => customer.lat && customer.lng)
                  .map((customer) => {
                    const position: LatLngTuple = [parseFloat(customer.lat!), parseFloat(customer.lng!)];
                    return (
                      <Marker
                        key={customer.id}
                        position={position}
                        icon={createCustomIcon(customer.status)}
                      >
                        <Popup>
                          <div className="p-2 space-y-1">
                            <h3 className="font-semibold text-foreground">{customer.name}</h3>
                            <p className="text-sm text-muted-foreground">{customer.address}</p>
                            <p className="text-sm text-muted-foreground">
                              Status: <span className="font-medium capitalize text-primary">{customer.status}</span>
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
                    );
                  })
                }
              </MapContainer>
            )}

            {/* Map Controls */}
            <Card className="absolute top-4 right-4 p-4 space-y-3 z-[1000] w-48 bg-card border border-border shadow-lg">
              <div className="text-sm font-medium text-foreground">Filter</div>
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <Checkbox
                    checked={filters.active}
                    onCheckedChange={(checked) => 
                      setFilters(prev => ({ ...prev, active: !!checked }))
                    }
                  />
                  <span className="text-sm text-muted-foreground">Aktive Kunden</span>
                </label>
                <label className="flex items-center space-x-2">
                  <Checkbox
                    checked={filters.potential}
                    onCheckedChange={(checked) => 
                      setFilters(prev => ({ ...prev, potential: !!checked }))
                    }
                  />
                  <span className="text-sm text-muted-foreground">Potentielle Kunden</span>
                </label>
                <label className="flex items-center space-x-2">
                  <Checkbox
                    checked={filters.inactive}
                    onCheckedChange={(checked) => 
                      setFilters(prev => ({ ...prev, inactive: !!checked }))
                    }
                  />
                  <span className="text-sm text-muted-foreground">Inaktive Kunden</span>
                </label>
              </div>
            </Card>

            {/* Customer Stats */}
            <Card className="absolute bottom-4 left-4 p-4 z-[1000] bg-card border border-border shadow-lg">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-primary">{stats.activeCustomers}</div>
                  <div className="text-xs text-muted-foreground">Aktive</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-accent">{stats.potentialCustomers}</div>
                  <div className="text-xs text-muted-foreground">Potentiell</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-muted-foreground">{stats.inactiveCustomers}</div>
                  <div className="text-xs text-muted-foreground">Inaktiv</div>
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
