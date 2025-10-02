import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Phone, Mail, Edit, Euro, ShoppingCart, Calendar, ChevronRight, Heart } from "lucide-react";
import { Link, useLocation } from "wouter";
import TopBar from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import api from "@/lib/api";
import type { MapCustomer } from "@shared/types/map-customer";
import { CustomerOrdersSheet } from "@/components/CustomerOrdersSheet";
import { CustomerWishlistSheet } from "@/components/CustomerWishlistSheet";
import { INTERACTION_CATEGORIES } from "@/data/interactionCategories";
import type { CustomerInteraction, CustomerInteractionsResponse } from "@shared/types/interaction";

interface CustomerProfile extends MapCustomer {
  memberSince?: string | null;
  discountLevel?: string | null;
  totalRevenue?: string | null;
  orderCount?: number | null;
  lastContact?: string | null;
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const customerId = id ?? "";
  const [location, navigate] = useLocation();
  const [newInteractionOpen, setNewInteractionOpen] = useState(false);

  const orderIdFromQuery = useMemo(() => {
    if (!location) return null;
    const queryStart = location.indexOf('?');
    if (queryStart === -1) return null;
    const queryString = location.slice(queryStart + 1);
    try {
      const params = new URLSearchParams(queryString);
      const order = params.get('order');
      return order ?? null;
    } catch (error) {
      console.warn('Failed to parse order query parameter', { location, error });
      return null;
    }
  }, [location]);

  const [ordersOpen, setOrdersOpen] = useState(Boolean(orderIdFromQuery));
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [initialOrderId, setInitialOrderId] = useState<string | null>(orderIdFromQuery);

  useEffect(() => {
    if (orderIdFromQuery) {
      setOrdersOpen(true);
      setInitialOrderId(orderIdFromQuery);
    } else {
      setInitialOrderId(null);
    }
  }, [orderIdFromQuery]);

  const { data: customer, isLoading: customerLoading } = useQuery<CustomerProfile>({
    queryKey: ["/admin-api/customer", customerId],
    queryFn: async () => {
      const response = await api.get(`/admin-api/customer/${customerId}`);
      return response.data as CustomerProfile;
    },
    enabled: Boolean(customerId)
  });

  const {
    data: interactionsData,
    isLoading: interactionsLoading,
    error: interactionsError,
  } = useQuery<CustomerInteraction[]>({
    queryKey: ["/admin-api/customer", customerId, "interactions"],
    queryFn: async () => {
      const response = await api.get<CustomerInteractionsResponse>(
        `/admin-api/customer/${customerId}/interactions`
      );
      return response.data.interactions ?? [];
    },
    enabled: Boolean(customerId),
  });

  const interactions = useMemo(() => {
    if (!interactionsData) return [] as CustomerInteraction[];
    return [...interactionsData].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );
  }, [interactionsData]);

  const interactionsErrorMessage =
    interactionsError instanceof Error ? interactionsError.message : null;

  const latestInteractionContact = useMemo(() => {
    if (interactions.length === 0) return null;
    return interactions[0]?.occurredAt ?? null;
  }, [interactions]);

  const effectiveLastContactIso = useMemo(() => {
    const interactionIso = latestInteractionContact;
    const customerIso = customer?.lastContact ?? null;

    if (!interactionIso) return customerIso;
    if (!customerIso) return interactionIso;

    return new Date(interactionIso).getTime() >= new Date(customerIso).getTime()
      ? interactionIso
      : customerIso;
  }, [latestInteractionContact, customer?.lastContact]);

  const lastContactLabel = useMemo(() => {
    if (!effectiveLastContactIso) return "–";
    const date = new Date(effectiveLastContactIso);
    if (Number.isNaN(date.getTime())) return "–";
    return date.toLocaleString('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }, [effectiveLastContactIso]);

  const handleCategorySelect = (categoryId: string) => {
    setNewInteractionOpen(false);
    navigate(`/customer/${customerId}/interaction/${categoryId}`);
  };

  if (customerLoading || !customer) {
    return (
      <>
        <TopBar title="Kundenakte" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground">Kunde wird geladen...</div>
        </div>
      </>
    );
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      active: "bg-primary/10 text-primary",
      potential: "bg-accent/10 text-accent",
      inactive: "bg-muted text-muted-foreground"
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
      case 'phone': return 'bg-primary/10 text-primary';
      case 'email': return 'bg-accent/10 text-accent';
      case 'meeting': return 'bg-secondary/10 text-secondary';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatDuration = (seconds?: number | null) => {
    if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const hours = Math.floor(mins / 60);
    const remainingMinutes = mins % 60;
    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} Minuten`;
  };

  const formatDueDate = (dueDate: string) => {
    const source = dueDate.includes('T') ? dueDate : `${dueDate}T00:00:00`;
    const parsed = new Date(source);
    return Number.isNaN(parsed.getTime())
      ? dueDate
      : parsed.toLocaleDateString('de-DE');
  };

  const formatInteractionTitle = (interaction: CustomerInteraction) => {
    const date = new Date(interaction.occurredAt);
    const formattedDate = date.toLocaleString('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    if (interaction.type === 'phone') {
      return `Telefonat am ${formattedDate}${interaction.employee ? ` von ${interaction.employee}` : ''}`;
    }
    return `Interaktion am ${formattedDate}`;
  };

  return (
    <>
      <TopBar title="Kundenakte" />
      <main className="flex-1 overflow-auto md:overflow-hidden">
        <div className="flex min-h-full flex-col md:h-full">
          {/* Customer Header */}
          <div className="bg-card border-b border-border px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                <Link href="/map">
                  <Button variant="ghost" size="sm" className="shrink-0">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <div className="flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <span className="px-4 py-2 text-base font-semibold sm:px-5 sm:py-3">
                    {customer.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-semibold text-foreground sm:text-xl">{customer.name}</h2>
                  <p className="truncate text-sm text-muted-foreground sm:text-base">{customer.email}</p>
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                <Button variant="outline" className="flex-1 border-border hover:bg-muted sm:flex-none">
                  <Phone className="mr-2 h-4 w-4" />
                  Anrufen
                </Button>
                <Button variant="outline" className="flex-1 border-border hover:bg-muted sm:flex-none">
                  <Mail className="mr-2 h-4 w-4" />
                  E-Mail
                </Button>
                <Button className="flex-1 sm:flex-none">
                  <Edit className="mr-2 h-4 w-4" />
                  Bearbeiten
                </Button>
              </div>
            </div>
          </div>

          {/* Customer Content */}
          <div className="flex-1 md:overflow-hidden">
            <div className="flex flex-col gap-6 md:h-full md:flex-row md:gap-0">
              {/* Main Content */}
              <div className="flex-1 p-4 sm:p-6 md:overflow-y-auto md:pr-6">
                {/* Customer Overview Cards */}
                <div className="grid grid-cols-1 gap-6 mb-6 md:grid-cols-3">
                  <Card className="bg-card">
                    <CardContent className="pt-6">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-primary/10 rounded-md flex items-center justify-center">
                            <Euro className="h-4 w-4 text-primary" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <p className="text-sm font-medium text-muted-foreground">Gesamtumsatz</p>
                          <p className="text-2xl font-semibold text-foreground">
                            €{parseFloat(customer.totalRevenue ?? "0").toLocaleString('de-DE')}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-card">
                    <CardContent className="pt-6">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-accent/10 rounded-md flex items-center justify-center">
                            <ShoppingCart className="h-4 w-4 text-accent" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <p className="text-sm font-medium text-muted-foreground">Bestellungen</p>
                          <p className="text-2xl font-semibold text-foreground">{customer.orderCount ?? 0}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-card">
                    <CardContent className="pt-6">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-secondary/10 rounded-md flex items-center justify-center">
                            <Calendar className="h-4 w-4 text-secondary" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <p className="text-sm font-medium text-muted-foreground">Letzter Kontakt</p>
                          <p className="text-2xl font-semibold text-foreground">{lastContactLabel}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Interaction History */}
                <Card className="bg-card">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
                    <h3 className="text-lg font-medium text-foreground">Interaktionsverlauf</h3>
                    <Dialog open={newInteractionOpen} onOpenChange={setNewInteractionOpen}>
                      <DialogTrigger asChild>
                        <Button className="w-full sm:w-auto">
                          <Calendar className="mr-2 h-4 w-4" />
                          Interaktion anlegen
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-background p-0 shadow-lg sm:max-w-lg">
                        <DialogHeader className="border-b border-border px-6 py-5 text-center sm:text-left">
                          <DialogTitle className="text-lg font-semibold text-foreground sm:text-xl">Interaktion anlegen</DialogTitle>
                          <DialogDescription className="mt-1 text-sm text-muted-foreground">
                            Wähle den passenden Kanal für die neue Kundeninteraktion.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2 p-4 sm:p-6">
                          {INTERACTION_CATEGORIES.map((category) => (
                            <Button
                              key={category.id}
                              variant="ghost"
                              className="group flex h-14 w-full items-center justify-between rounded-lg border border-border bg-card px-4 text-left transition-all hover:border-primary hover:bg-primary/5"
                              onClick={() => handleCategorySelect(category.id)}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`flex h-10 w-10 items-center justify-center rounded-md ${category.accentClass}`}>
                                  <category.icon className="h-5 w-5" />
                                </div>
                                <span className="text-sm font-medium text-foreground sm:text-base">{category.title}</span>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                            </Button>
                          ))}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <CardContent className="p-4 sm:p-6">
                    {interactionsLoading ? (
                      <div className="text-center text-muted-foreground">Interaktionen werden geladen...</div>
                    ) : interactionsErrorMessage ? (
                      <div className="text-center text-destructive">
                        Interaktionen konnten nicht geladen werden: {interactionsErrorMessage}
                      </div>
                    ) : interactions.length === 0 ? (
                      <div className="text-center text-muted-foreground">Keine Interaktionen vorhanden</div>
                    ) : (
                      <div className="space-y-4">
                        {interactions.map((interaction) => {
                          const durationLabel = formatDuration(interaction.durationSeconds ?? null);
                          return (
                            <div key={interaction.id} className="flex items-start gap-4 rounded-lg bg-muted p-4">
                              <div className="flex-shrink-0">
                                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${getInteractionColor(interaction.type)}`}>
                                  {getInteractionIcon(interaction.type)}
                                </div>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                                  <p className="text-sm font-semibold text-foreground">
                                    {formatInteractionTitle(interaction)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(interaction.occurredAt).toLocaleDateString('de-DE', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                    })}
                                  </p>
                                </div>
                                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                                  {interaction.topic && (
                                    <p>
                                      <span className="font-medium text-foreground">Thema:</span> {interaction.topic}
                                    </p>
                                  )}
                                  {interaction.result && (
                                    <p>
                                      <span className="font-medium text-foreground">Ergebnis:</span> {interaction.result}
                                    </p>
                                  )}
                                  {interaction.notes && (
                                    <p className="whitespace-pre-line">{interaction.notes}</p>
                                  )}
                                  {interaction.followUp && (
                                    <p>
                                      <span className="font-medium text-foreground">Verknüpfte Aufgabe:</span>{' '}
                                      {interaction.followUp.title} – fällig am{' '}
                                      {formatDueDate(interaction.followUp.dueDate)}
                                    </p>
                                  )}
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                  {durationLabel && <span>Dauer: {durationLabel}</span>}
                                  {interaction.followUp?.assignee && (
                                    <span>
                                      Zuständig: {interaction.followUp.assignee}
                                    </span>
                                  )}
                                  {interaction.attachmentsCount && interaction.attachmentsCount > 0 && (
                                    <span>Anhänge: {interaction.attachmentsCount}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar Info */}
              <div className="w-full shrink-0 border-t border-border bg-muted p-4 sm:p-6 md:w-80 md:border-l md:border-t-0 md:bg-muted md:px-6 md:py-6 md:overflow-y-auto">
                <div className="space-y-6">
                  {/* Contact Information */}
                  <Card className="bg-card">
                    <CardContent className="p-4">
                      <h4 className="mb-3 text-sm font-medium text-foreground">Kontaktinformationen</h4>
                      <div className="space-y-3 text-sm">
                        <div className="flex items-center">
                          <Mail className="mr-3 h-4 w-4 text-muted-foreground" />
                          <span>{customer.email}</span>
                        </div>
                        {customer.phone && (
                          <div className="flex items-center">
                            <Phone className="mr-3 h-4 w-4 text-muted-foreground" />
                            <span>{customer.phone}</span>
                          </div>
                        )}
                        {customer.address && (
                          <div className="flex items-start">
                            <div className="mr-3 mt-0.5 h-4 w-4 text-muted-foreground">📍</div>
                            <span>{customer.address}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Customer Status */}
                  <Card className="bg-card">
                    <CardContent className="p-4">
                      <h4 className="mb-3 text-sm font-medium text-foreground">Status</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-sm text-muted-foreground">Kundenstatus</span>
                          <Badge className={getStatusBadge(customer.status)}>
                            {customer.status === 'active' ? 'Aktiv'
                              : customer.status === 'potential' ? 'Potentiell'
                              : 'Inaktiv'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-sm text-muted-foreground">Kundennummer</span>
                          <span className="text-sm text-foreground">{customer.customerNumber ?? '–'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-sm text-muted-foreground">Kundengruppe</span>
                          <span className="text-sm text-foreground">{customer.customerGroup ?? '–'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-sm text-muted-foreground">Seit</span>
                          <span className="text-sm text-foreground">
                            {customer.memberSince
                              ? new Date(customer.memberSince).toLocaleDateString('de-DE')
                              : '–'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-sm text-muted-foreground">Preisgruppe</span>
                          <span className="text-sm text-foreground">{customer.priceGroup ?? '–'}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Action Button */}
                  <div className="space-y-3">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setOrdersOpen(true);
                        if (typeof window !== 'undefined') {
                          const url = new URL(window.location.href);
                          if (url.searchParams.has('order')) {
                            url.searchParams.delete('order');
                            navigate(`${url.pathname}${url.search}`, { replace: true });
                          }
                        }
                      }}
                    >
                      Alle Bestellungen anzeigen
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setWishlistOpen(true)}
                    >
                      <Heart className="mr-2 h-4 w-4" /> Mein Sortiment anzeigen
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <CustomerOrdersSheet
        open={ordersOpen}
        onOpenChange={(open) => {
          setOrdersOpen(open);
          if (!open && typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            if (url.searchParams.has('order')) {
              url.searchParams.delete('order');
              navigate(`${url.pathname}${url.search}`, { replace: true });
            }
          }
        }}
        customerId={customer.id}
        customerName={customer.name}
        initialOrderId={initialOrderId}
      />
      <CustomerWishlistSheet
        open={wishlistOpen}
        onOpenChange={setWishlistOpen}
        customerId={customer.id}
        customerName={customer.name}
      />
    </>
  );
}
