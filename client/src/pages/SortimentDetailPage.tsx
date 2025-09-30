import { useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import TopBar from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  FileDown,
  Heart,
  HeartOff,
  ListPlus,
  Percent,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { sampleCustomersForComparison } from "@/data/sampleCustomers";
import type { CatalogDetailResponse, CatalogDetailItem } from "@shared/types/catalog";

const stockChartConfig: ChartConfig = {
  stock: {
    label: "Bestand",
    color: "hsl(var(--primary))",
  },
};

function formatCurrency(value: number | null | undefined, currency = "EUR") {
  if (value == null) {
    return "–";
  }
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

export default function SortimentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const detailQuery = useQuery({
    queryKey: ["catalog-detail", id],
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const response = await api.get<CatalogDetailResponse>(`/admin-api/catalog/${id}`, { signal });
      return response.data;
    },
  });

  const item: CatalogDetailItem | null = detailQuery.data?.item ?? null;

  const [isFavorite, setIsFavorite] = useState(false);
  const [wishlistItem, setWishlistItem] = useState<CatalogDetailItem | null>(null);
  const [wishlistCustomer, setWishlistCustomer] = useState<string>(sampleCustomersForComparison[0]?.id ?? "");
  const [wishlistNote, setWishlistNote] = useState("");
  const [priceCustomer, setPriceCustomer] = useState<string>(sampleCustomersForComparison[0]?.id ?? "");
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);

  const chartData = useMemo(() => {
    if (!item?.stockHistory?.length) {
      return [];
    }
    const now = new Date();
    return [...item.stockHistory]
      .sort((a, b) => Number(a.month) - Number(b.month))
      .map((point) => {
        const offset = Number(point.month);
        const date = new Date(now);
        date.setMonth(now.getMonth() + offset);
        const label = new Intl.DateTimeFormat("de-DE", { month: "short" }).format(date);
        return {
          label,
          quantity: point.quantity,
        };
      });
  }, [item?.stockHistory]);

  const priceData = useMemo(() => {
    if (!item || !priceCustomer) {
      return null;
    }
    const customer = sampleCustomersForComparison.find((entry) => entry.id === priceCustomer);
    if (!customer) {
      return null;
    }
    const tier = item.prices.find((price) => price.tier === customer.priceGroup);
    if (!tier) {
      return {
        customer,
        price: item.prices[0]?.value ?? null,
        discounted: null,
      };
    }
    const net = tier.value;
    return {
      customer,
      price: net,
      discounted: net != null ? net * (1 - customer.discount / 100) : null,
    };
  }, [item, priceCustomer]);

  const handleBack = () => {
    navigate("/sortiment");
  };

  const handleToggleFavorite = () => {
    if (!item) return;
    setIsFavorite((prev) => {
      const next = !prev;
      toast({
        title: next ? "Favorit gespeichert" : "Favorit entfernt",
        description: next
          ? `${item.wineName ?? item.articleNumber ?? "Artikel"} ist jetzt in deiner Favoritenliste.`
          : `${item.wineName ?? item.articleNumber ?? "Artikel"} wurde aus deinen Favoriten entfernt.`,
      });
      return next;
    });
  };

  const handleOpenWishlist = () => {
    if (!item) return;
    setWishlistItem(item);
    setWishlistCustomer(sampleCustomersForComparison[0]?.id ?? "");
    setWishlistNote("");
  };

  const handleSaveWishlist = () => {
    if (!wishlistItem || !wishlistCustomer) {
      return;
    }
    const customer = sampleCustomersForComparison.find((entry) => entry.id === wishlistCustomer);
    toast({
      title: "Zur Merkliste hinzugefügt",
      description: `${wishlistItem.wineName ?? wishlistItem.articleNumber ?? "Artikel"} wurde für ${customer?.name ?? "den ausgewählten Kunden"} vorgemerkt.`,
    });
    setWishlistItem(null);
    setWishlistNote("");
  };

  const handleQuickOrder = () => {
    if (!item) return;
    toast({
      title: "Bestellung vorbereiten",
      description: `Bestellung für ${item.wineName ?? item.articleNumber ?? "Artikel"} wird über die Admin-API angelegt (Platzhalter).`,
    });
  };

  if (detailQuery.isLoading) {
    return (
      <>
        <TopBar title="Sortiment" showSearch={false} />
        <main className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col items-center justify-center space-y-4 p-6 text-center text-muted-foreground">
            Daten werden geladen...
          </div>
        </main>
      </>
    );
  }

  if (!item) {
    return (
      <>
        <TopBar title="Sortiment" showSearch={false} />
        <main className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col items-center justify-center space-y-4 p-6 text-center text-muted-foreground">
            <p>Der gewünschte Artikel konnte nicht gefunden werden.</p>
            <Button variant="outline" onClick={handleBack}>
              Zur Übersicht
            </Button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar
        title="Sortiment"
        showSearch={false}
        actions={(
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Zur Übersicht
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setPriceDialogOpen(true)}>
              <Percent className="h-4 w-4" />
              Preisvergleich
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleOpenWishlist}>
              <ListPlus className="h-4 w-4" />
              Merkliste
            </Button>
            <Button className="gap-2" onClick={handleQuickOrder}>
              <ShoppingCart className="h-4 w-4" />
              Bestellung
            </Button>
          </div>
        )}
      />
      <main className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto p-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-sm md:flex-row">
              <div className="flex-1 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-semibold text-foreground">
                      {item.wineName ?? "Unbenannter Artikel"} {item.vintage && `(${item.vintage})`}
                    </h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{item.winery ?? "Unbekanntes Weingut"}</span>
                      <span>•</span>
                      <span>{item.articleNumber ?? "–"}</span>
                      <span>•</span>
                      <span>{item.volume ?? "–"}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleToggleFavorite}
                    aria-label={isFavorite ? "Favorit entfernen" : "Zu Favoriten"}
                  >
                    {isFavorite ? <Heart className="h-5 w-5 text-primary" /> : <HeartOff className="h-5 w-5" />}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.country && <Badge variant="secondary">{item.country}</Badge>}
                  {item.region && <Badge variant="secondary">{item.region}</Badge>}
                  {item.grapes.map((grape) => (
                    <Badge key={grape} variant="outline">
                      {grape}
                    </Badge>
                  ))}
                  {item.certifications.map((cert) => (
                    <Badge key={cert} variant="outline" className="border-dashed">
                      {cert}
                    </Badge>
                  ))}
                </div>
                {item.description && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.description.replace(/<[^>]+>/g, " ").trim()}
                  </p>
                )}
                {item.allocation && (
                  <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="flex items-center gap-2 font-medium">
                      <Sparkles className="h-4 w-4" />
                      Allokation aktiv: {item.allocation.quantity} Fl. reserviert
                    </div>
                    {item.allocation.note && (
                      <p className="mt-1 text-xs leading-relaxed">{item.allocation.note}</p>
                    )}
                  </div>
                )}
              </div>
              {item.image && (
                <div className="flex w-full max-w-[220px] items-center justify-center self-center rounded-lg border border-dashed border-border bg-muted/40 p-4">
                  <img
                    src={item.image}
                    alt={`${item.wineName ?? "Artikel"} Etikett`}
                    className="h-48 w-auto object-contain"
                    loading="lazy"
                  />
                </div>
              )}
            </div>

            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Verkaufsinformationen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Verfügbar</span>
                      <p className="text-2xl font-semibold text-foreground">
                        {item.stock != null ? `${item.stock.toLocaleString("de-DE")} Fl.` : "–"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">VK1</span>
                      <p className="text-2xl font-semibold text-foreground">
                        {formatCurrency(item.prices[0]?.value)}
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-3">
                    {item.prices.map((tier) => (
                      <div key={tier.tier} className="flex items-center justify-between rounded border border-border/50 bg-muted/30 px-3 py-2">
                        <span className="font-medium text-foreground">{tier.label}</span>
                        <span>{formatCurrency(tier.value)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Bestandsentwicklung</CardTitle>
                </CardHeader>
                <CardContent>
                  {chartData.length > 0 ? (
                    <ChartContainer config={stockChartConfig} className="h-56">
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis hide domain={[0, "dataMax + 20"]} />
                        <Tooltip content={<ChartTooltipContent indicator="line" />} />
                        <Area
                          type="monotone"
                          dataKey="quantity"
                          stroke="var(--color-stock)"
                          fill="var(--color-stock)"
                          fillOpacity={0.2}
                        />
                      </AreaChart>
                    </ChartContainer>
                  ) : (
                    <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                      Keine Verlaufdaten vorhanden.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top 5 Kunden</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {item.topCustomers.length === 0 && (
                    <div className="rounded border border-dashed border-border/70 bg-muted/40 p-4 text-center text-muted-foreground">
                      Keine Bestellungen gefunden.
                    </div>
                  )}
                  {item.topCustomers.map((customer) => (
                    <div key={customer.id} className="flex items-center justify-between rounded border border-border/60 bg-muted/30 px-3 py-2">
                      <div>
                        <p className="font-medium text-foreground">{customer.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Zuletzt bestellt: {customer.lastOrdered ?? "–"}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div className="font-semibold text-foreground">{customer.quantity ?? 0} Fl.</div>
                        <div>Preis: {customer.priceTier ?? "–"}</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Aktionen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Button className="w-full gap-2" onClick={handleQuickOrder}>
                    <ShoppingCart className="h-4 w-4" />
                    Bestellung starten
                  </Button>
                  <Button variant="outline" className="w-full gap-2" onClick={() => setPriceDialogOpen(true)}>
                    <Percent className="h-4 w-4" />
                    Preisvergleich öffnen
                  </Button>
                  <Button variant="outline" className="w-full gap-2" onClick={handleOpenWishlist}>
                    <ListPlus className="h-4 w-4" />
                    Für Kunden vormerken
                  </Button>
                  <Button variant="ghost" className="w-full gap-2" onClick={handleToggleFavorite}>
                    {isFavorite ? <Heart className="h-4 w-4 text-primary" /> : <HeartOff className="h-4 w-4" />}
                    {isFavorite ? "In Favoriten" : "Zu Favoriten"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full gap-2"
                    onClick={() =>
                      toast({
                        title: "Export wird vorbereitet",
                        description: "Der PDF-/Excel-Export wird mit der Admin-API verbunden.",
                      })
                    }
                  >
                    <FileDown className="h-4 w-4" />
                    Export (PDF/Excel)
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Dialog open={Boolean(wishlistItem)} onOpenChange={(open) => !open && setWishlistItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Merkliste für Kunden</DialogTitle>
            <DialogDescription>
              Wähle einen Kunden aus und hinterlasse optional eine Notiz für die Tour-Vorbereitung.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {wishlistItem && (
              <div className="rounded border border-border/70 bg-muted/40 p-3 text-sm">
                <div className="font-semibold text-foreground">{wishlistItem.wineName ?? wishlistItem.articleNumber}</div>
                <div className="text-muted-foreground text-xs">
                  {wishlistItem.articleNumber ?? "–"} • {wishlistItem.winery ?? "Unbekanntes Weingut"}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="wishlist-customer">Kunde</Label>
              <Select value={wishlistCustomer} onValueChange={setWishlistCustomer}>
                <SelectTrigger id="wishlist-customer">
                  <SelectValue placeholder="Kunde auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {sampleCustomersForComparison.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name} ({customer.priceGroup})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wishlist-note">Notiz</Label>
              <Textarea
                id="wishlist-note"
                placeholder="z. B. Speisenbegleitung oder Anlass"
                value={wishlistNote}
                onChange={(event) => setWishlistNote(event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setWishlistItem(null)}>
                Abbrechen
              </Button>
              <Button onClick={handleSaveWishlist}>
                Speichern
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Preisvergleich</DialogTitle>
            <DialogDescription>
              Kundenspezifische Preise basierend auf Preisgruppen und Rabatten.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded border border-border/70 bg-muted/40 p-3 text-sm">
              <div className="font-semibold text-foreground">{item.wineName ?? item.articleNumber} {item.vintage && `(${item.vintage})`}</div>
              <div className="text-muted-foreground text-xs">
                {item.articleNumber ?? "–"} • {item.winery ?? "Unbekanntes Weingut"}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price-customer">Kunde</Label>
              <Select value={priceCustomer} onValueChange={setPriceCustomer}>
                <SelectTrigger id="price-customer">
                  <SelectValue placeholder="Kunde auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {sampleCustomersForComparison.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name} ({customer.priceGroup})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Card className="border-dashed bg-muted/40">
              <CardContent className="space-y-2 p-4">
                {priceData ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Preisgruppe</span>
                      <span className="font-semibold">{priceData.customer.priceGroup}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Listenpreis</span>
                      <span className="font-semibold">
                        {formatCurrency(priceData.price)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Kundenrabatt</span>
                      <span className="font-semibold">{priceData.customer.discount}%</span>
                    </div>
                    <div className="flex items-center justify-between text-base">
                      <span className="font-semibold text-foreground">Netto-Kundenpreis</span>
                      <span className="font-semibold text-primary">
                        {formatCurrency(priceData.discounted)}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Bitte wähle einen Kunden aus, um Preise zu sehen.</p>
                )}
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setPriceDialogOpen(false)}>
                Schließen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
