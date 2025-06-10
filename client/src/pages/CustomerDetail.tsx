import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Phone, Mail, Edit, Euro, ShoppingCart, Calendar } from "lucide-react";
import { Link } from "wouter";
import TopBar from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Customer, Interaction } from "@shared/schema";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const customerId = parseInt(id || "0");

  const { data: customer, isLoading: customerLoading } = useQuery<Customer>({
    queryKey: [`/api/customers/${customerId}`],
    enabled: !!customerId && !isNaN(customerId),
  });

  const { data: interactions = [], isLoading: interactionsLoading } = useQuery<Interaction[]>({
    queryKey: [`/api/interactions`, customerId],
    queryFn: async () => {
      const response = await fetch(`/api/interactions?customerId=${customerId}`, {
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch interactions");
      return response.json();
    },
    enabled: !!customerId && !isNaN(customerId),
  });

  if (customerLoading || !customer) {
    return (
      <>
        <TopBar title="Kundenakte" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">Kunde wird geladen...</div>
        </div>
      </>
    );
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      active: "bg-green-100 text-green-800",
      potential: "bg-orange-100 text-orange-800", 
      inactive: "bg-red-100 text-red-800"
    };
    return variants[status as keyof typeof variants] || variants.active;
  };

  const getInteractionIcon = (type: string) => {
    switch (type) {
      case 'phone': return <Phone className="w-4 h-4" />;
      case 'email': return <Mail className="w-4 h-4" />;
      case 'meeting': return <Calendar className="w-4 h-4" />;
      default: return <Mail className="w-4 h-4" />;
    }
  };

  const getInteractionColor = (type: string) => {
    switch (type) {
      case 'phone': return 'bg-green-100 text-green-600';
      case 'email': return 'bg-blue-100 text-blue-600';
      case 'meeting': return 'bg-purple-100 text-purple-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - d.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Heute';
    if (diffDays === 2) return 'Gestern';
    if (diffDays <= 7) return `${diffDays - 1} Tage`;
    return d.toLocaleDateString('de-DE');
  };

  return (
    <>
      <TopBar title="Kundenakte" />
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          {/* Customer Header */}
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Link href="/map">
                  <Button variant="ghost" size="sm">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-primary font-semibold">
                    {customer.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{customer.name}</h2>
                  <p className="text-gray-500">{customer.email}</p>
                </div>
              </div>
              <div className="flex space-x-3">
                <Button variant="outline">
                  <Phone className="h-4 w-4 mr-2" />
                  Anrufen
                </Button>
                <Button variant="outline">
                  <Mail className="h-4 w-4 mr-2" />
                  E-Mail
                </Button>
                <Button>
                  <Edit className="h-4 w-4 mr-2" />
                  Bearbeiten
                </Button>
              </div>
            </div>
          </div>

          {/* Customer Content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Main Content */}
            <div className="flex-1 p-6 overflow-y-auto">
              {/* Customer Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                          <Euro className="h-4 w-4 text-green-600" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500">Gesamtumsatz</p>
                        <p className="text-2xl font-semibold text-gray-900">
                          €{parseFloat(customer.totalRevenue || "0").toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                          <ShoppingCart className="h-4 w-4 text-blue-600" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500">Bestellungen</p>
                        <p className="text-2xl font-semibold text-gray-900">{customer.orderCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-purple-100 rounded-md flex items-center justify-center">
                          <Calendar className="h-4 w-4 text-purple-600" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500">Letzter Kontakt</p>
                        <p className="text-2xl font-semibold text-gray-900">{customer.lastContact}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Interaction History */}
              <Card>
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">Interaktionsverlauf</h3>
                  <Button>
                    <Calendar className="h-4 w-4 mr-2" />
                    Neue Interaktion
                  </Button>
                </div>
                
                <CardContent className="p-6">
                  {interactionsLoading ? (
                    <div className="text-center text-gray-500">Interaktionen werden geladen...</div>
                  ) : interactions.length === 0 ? (
                    <div className="text-center text-gray-500">Keine Interaktionen vorhanden</div>
                  ) : (
                    <div className="space-y-4">
                      {interactions.map((interaction) => (
                        <div key={interaction.id} className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                          <div className="flex-shrink-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getInteractionColor(interaction.type)}`}>
                              {getInteractionIcon(interaction.type)}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-gray-900">{interaction.title}</p>
                              <p className="text-sm text-gray-500">{formatDate(interaction.createdAt!)}</p>
                            </div>
                            {interaction.description && (
                              <p className="text-sm text-gray-600 mt-1">{interaction.description}</p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                              {interaction.duration && <span>Dauer: {interaction.duration}</span>}
                              <Badge variant="secondary" className="text-xs">
                                {interaction.status === 'completed' ? 'Abgeschlossen' : 
                                 interaction.status === 'planned' ? 'Geplant' : 'Abgebrochen'}
                              </Badge>
                              {interaction.attachments > 0 && (
                                <span>Anhänge: {interaction.attachments}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar Info */}
            <div className="w-80 bg-gray-50 border-l border-gray-200 p-6 overflow-y-auto">
              <div className="space-y-6">
                {/* Contact Information */}
                <Card>
                  <CardContent className="p-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Kontaktinformationen</h4>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center">
                        <Mail className="h-4 w-4 text-gray-400 mr-3" />
                        <span>{customer.email}</span>
                      </div>
                      {customer.phone && (
                        <div className="flex items-center">
                          <Phone className="h-4 w-4 text-gray-400 mr-3" />
                          <span>{customer.phone}</span>
                        </div>
                      )}
                      {customer.address && (
                        <div className="flex items-start">
                          <div className="h-4 w-4 text-gray-400 mr-3 mt-0.5">📍</div>
                          <span>{customer.address}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Customer Status */}
                <Card>
                  <CardContent className="p-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Status</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Kundenstatus</span>
                        <Badge className={getStatusBadge(customer.status)}>
                          {customer.status === 'active' ? 'Aktiv' : 
                           customer.status === 'potential' ? 'Potentiell' : 'Inaktiv'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Seit</span>
                        <span className="text-sm text-gray-900">{customer.memberSince}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Rabattstufe</span>
                        <span className="text-sm text-gray-900">{customer.discountLevel}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Action Button */}
                <Button variant="outline" className="w-full">
                  Alle Bestellungen anzeigen
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
