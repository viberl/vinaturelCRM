import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, PackageSearch, ShoppingCart, Truck } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import type { CustomerOrderSummary } from "@shared/types/order";

interface CustomerOrdersSheetProps {
  customerId: string;
  customerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialOrderId?: string | null;
}

function formatCurrency(value: number | null | undefined, currency?: string | null) {
  if (value === null || value === undefined) {
    return '–';
  }

  const formatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 2
  });

  return formatter.format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '–';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '–';
  }

  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTaxRate(value: number) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const fractionDigits = Math.abs(value - Math.round(value)) < 0.01 ? 0 : 2;
  return `${value.toLocaleString('de-DE', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  })}%`;
}

export function CustomerOrdersSheet({ customerId, customerName, open, onOpenChange, initialOrderId }: CustomerOrdersSheetProps) {
  const { data: orders = [], isLoading, isFetching } = useQuery<CustomerOrderSummary[]>({
    queryKey: ['/admin-api/customer', customerId, 'orders'],
    queryFn: async () => {
      const response = await api.get(`/admin-api/customer/${customerId}/orders`);
      return response.data as CustomerOrderSummary[];
    },
    enabled: open && Boolean(customerId),
    staleTime: 1000 * 60 // 1 Minute
  });

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId ?? null);

  useEffect(() => {
    if (open && orders.length > 0) {
      if (initialOrderId) {
        const exists = orders.some((order) => order.id === initialOrderId);
        if (exists) {
          setSelectedOrderId(initialOrderId);
          return;
        }
      }
      setSelectedOrderId((current) => {
        if (current && orders.some((order) => order.id === current)) {
          return current;
        }
        return orders[0].id;
      });
    }
    if (!open) {
      setSelectedOrderId(null);
    }
  }, [open, orders, initialOrderId]);

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return orders.find((order) => order.id === selectedOrderId) ?? null;
  }, [orders, selectedOrderId]);

  const vatDetails = useMemo<null | { amount: string | null; rateLabel: string | null }>(() => {
    if (!selectedOrder) {
      return null;
    }

    const amount =
      selectedOrder.taxAmount !== null && selectedOrder.taxAmount !== undefined
        ? formatCurrency(selectedOrder.taxAmount, selectedOrder.currency)
        : null;

    const uniqueRates = Array.from(
      new Set(
        selectedOrder.lineItems
          .map((item) =>
            typeof item.taxRate === 'number' && Number.isFinite(item.taxRate)
              ? Number(item.taxRate.toFixed(2))
              : null
          )
          .filter((value): value is number => value !== null)
      )
    )
      .sort((a, b) => a - b)
      .map((rate) => formatTaxRate(rate))
      .filter((value): value is string => Boolean(value));

    const rateLabel = uniqueRates.length > 0 ? uniqueRates.join(' / ') : null;

    if (!amount && !rateLabel) {
      return null;
    }

    return { amount, rateLabel };
  }, [selectedOrder]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-4xl">
        <SheetHeader className="text-left">
          <SheetTitle>Bestellungen</SheetTitle>
          <SheetDescription>
            Übersicht aller Bestellungen von {customerName}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-6 lg:h-full lg:flex-row">
          <div className="flex w-full flex-col border-b border-border pb-4 lg:h-full lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShoppingCart className="h-4 w-4" />
                <span>{orders.length} Bestellung{orders.length === 1 ? '' : 'en'}</span>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-2 pb-6">
                {isLoading ? (
                  <div className="flex h-40 items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Bestellungen werden geladen…
                  </div>
                ) : orders.length === 0 ? (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                    <PackageSearch className="h-6 w-6" />
                    <span>Keine Bestellungen gefunden.</span>
                  </div>
                ) : (
                  orders.map((order) => {
                    const isActive = order.id === selectedOrderId;
                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => setSelectedOrderId(order.id)}
                        className={cn(
                          'w-full rounded-lg border p-3 text-left transition-colors',
                          isActive
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-transparent bg-muted hover:border-primary/50 hover:bg-primary/5'
                        )}
                      >
                        <div className="flex items-center justify-between text-sm font-medium">
                          <span>#{order.orderNumber ?? 'ohne Nummer'}</span>
                          <Badge variant={isActive ? 'default' : 'secondary'}>
                            {order.lineItemCount} Position{order.lineItemCount === 1 ? '' : 'en'}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatDate(order.orderDate)}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-foreground">
                          {formatCurrency(order.totalAmount, order.currency)}
                        </div>
                        {order.status && (
                          <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                            {order.status}
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="flex-1 lg:overflow-hidden lg:pl-2">
            {isLoading && !selectedOrder ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Daten werden geladen…
              </div>
            ) : !selectedOrder ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <ShoppingCart className="h-6 w-6" />
                <span>Bitte wähle eine Bestellung aus der Liste.</span>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-4 shadow-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Bestellnummer</p>
                    <p className="text-sm font-medium text-foreground">#{selectedOrder.orderNumber ?? 'ohne Nummer'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Datum</p>
                    <p className="text-sm font-medium text-foreground">{formatDate(selectedOrder.orderDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gesamtsumme ohne MwSt.</p>
                    <p className="text-sm font-medium text-foreground">{formatCurrency(selectedOrder.netAmount, selectedOrder.currency)}</p>
                    {vatDetails && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        zzgl. MwSt.
                        {vatDetails.amount ? ` ${vatDetails.amount}` : ''}
                        {vatDetails.rateLabel ? ` (${vatDetails.rateLabel})` : ''}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Versandkosten</p>
                    <p className="text-sm font-medium text-foreground">{formatCurrency(selectedOrder.shippingTotal, selectedOrder.currency)}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <div className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-foreground">
                      <Truck className="h-4 w-4" />
                      {selectedOrder.status ?? 'Unbekannt'}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex-1 overflow-hidden">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Positionen</h3>
                  <div className="rounded-lg border border-border bg-card shadow-sm">
                    <div className="max-h-[28rem] overflow-y-auto overflow-x-auto pr-2">
                      <Table className="min-w-full">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Artikel</TableHead>
                            <TableHead className="w-20 text-right">Menge</TableHead>
                            <TableHead className="w-32 text-right">Einzelpreis</TableHead>
                            <TableHead className="w-32 text-right">Gesamt</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedOrder.lineItems.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                                Keine Positionen vorhanden.
                              </TableCell>
                            </TableRow>
                          ) : (
                            selectedOrder.lineItems.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell>
                                  <div className="flex flex-col gap-0.5">
                                  {item.manufacturer && (
                                    <span className="text-xs font-medium text-muted-foreground">
                                      {item.manufacturer}
                                    </span>
                                  )}
                                  <span className="font-medium text-foreground">{item.label ?? 'Artikel'}</span>
                                  {(item.vintage || item.volume) && (
                                    <span className="text-xs text-muted-foreground">
                                      {item.vintage ? `Jahrgang: ${item.vintage}` : null}
                                      {item.vintage && item.volume ? ' · ' : ''}
                                      {item.volume ? `Volumen: ${item.volume}` : null}
                                    </span>
                                  )}
                                  {item.productNumber && (
                                    <span className="text-xs text-muted-foreground">{item.productNumber}</span>
                                  )}
                                  {typeof item.taxRate === 'number' && (
                                    <span className="text-xs text-muted-foreground">
                                      Steuersatz: {formatTaxRate(item.taxRate) ?? `${item.taxRate}%`}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right">{formatCurrency(item.unitPrice, selectedOrder.currency)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(item.totalPrice, selectedOrder.currency)}</TableCell>
                            </TableRow>
                          ))
                        )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {isFetching && !isLoading && (
          <div className="absolute bottom-4 right-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            Aktualisiere…
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
