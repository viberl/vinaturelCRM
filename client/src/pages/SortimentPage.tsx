import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { isAxiosError } from "axios";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import TopBar from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FileDown,
  Filter,
  Heart,
  HeartOff,
  ListPlus,
  PackageSearch,
  Percent,
  ShoppingCart,
  Sparkles,
  Star,
  StarOff,
  UploadCloud,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import api from "@/lib/api";
import { sampleCustomersForComparison } from "@/data/sampleCustomers";
import type { CatalogSummaryItem, CatalogListResponse } from "@shared/types/catalog";
import type { FocusWineListResponse } from "@shared/types/focus-list";
import { normalizeArticleNumber } from "@shared/utils/article";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type CatalogQueryKey = [
  "catalog",
  {
    searchTerm: string;
    articleNumber: string;
    selectedWinery: string | "all";
  }
];

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

export default function SortimentPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const searchTerm = "";
  const [articleNumber, setArticleNumber] = useState("");
  const [selectedWinery, setSelectedWinery] = useState<string | "all">("all");
  const [selectedVintage, setSelectedVintage] = useState<string | "all">("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [hideZeroStock, setHideZeroStock] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [sortOption, setSortOption] = useState<"name" | "stock" | "vintage" | "price">("name");
  const [wishlistItem, setWishlistItem] = useState<CatalogSummaryItem | null>(null);
  const [wishlistCustomer, setWishlistCustomer] = useState<string>(sampleCustomersForComparison[0]?.id ?? "");
  const [wishlistNote, setWishlistNote] = useState("");
  const [priceItem, setPriceItem] = useState<CatalogSummaryItem | null>(null);
  const [priceCustomer, setPriceCustomer] = useState<string>(sampleCustomersForComparison[0]?.id ?? "");
  const [focusUploadOpen, setFocusUploadOpen] = useState(false);
  const [focusUploadFile, setFocusUploadFile] = useState<File | null>(null);
  const focusFileInputRef = useRef<HTMLInputElement | null>(null);

  const catalogQuery = useQuery<CatalogListResponse, Error, CatalogListResponse, CatalogQueryKey>({
    queryKey: [
      "catalog",
      {
        searchTerm,
        articleNumber,
        selectedWinery,
      },
    ],
    queryFn: async ({ signal, queryKey }) => {
      const [, params] = queryKey;

      const searchParams = new URLSearchParams();
      if (params.searchTerm.trim()) {
        searchParams.set("search", params.searchTerm.trim());
      }
      if (params.articleNumber.trim()) {
        searchParams.set("articleNumber", params.articleNumber.trim());
      }
      if (params.selectedWinery !== "all") {
        searchParams.set("manufacturerId", params.selectedWinery);
      }
      const url = `/admin-api/catalog${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      const response = await api.get<CatalogListResponse>(url, { signal });
      return response.data;
    },
    placeholderData: (previousData) => previousData,
  });

  const catalogItems: CatalogSummaryItem[] = catalogQuery.data?.items ?? [];
  const availableWineries = catalogQuery.data?.facets?.wineries ?? [];
  const availableVintages = catalogQuery.data?.facets?.vintages ?? [];

  const focusListQuery = useQuery<FocusWineListResponse>({
    queryKey: ["focus-wines"],
    queryFn: async ({ signal }) => {
      const response = await api.get<FocusWineListResponse>("/admin-api/focus-wines", { signal });
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const canUploadFocusList = useMemo(() => {
    const role = user?.role?.toLowerCase();
    return role === "management" || role === "innendienst";
  }, [user?.role]);

  const focusArticleSet = useMemo(() => {
    const entries = focusListQuery.data?.articleNumbers ?? [];
    const sanitized = entries
      .map((entry) => normalizeArticleNumber(entry))
      .filter((value): value is string => Boolean(value));
    return new Set(sanitized);
  }, [focusListQuery.data?.articleNumbers]);

  const focusListLastUpdated = useMemo(() => {
    if (!focusListQuery.data?.uploadedAt) {
      return null;
    }
    const date = new Date(focusListQuery.data.uploadedAt);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  }, [focusListQuery.data?.uploadedAt]);

  const focusUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.post<FocusWineListResponse>("/admin-api/focus-wines/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["focus-wines"], data);
      void queryClient.invalidateQueries({ queryKey: ["focus-wines"] });
      toast({
        title: "Fokusliste aktualisiert",
        description: `${data.count} Artikel sind jetzt als Fokus hinterlegt.`,
      });
      setFocusUploadOpen(false);
      setFocusUploadFile(null);
      if (focusFileInputRef.current) {
        focusFileInputRef.current.value = "";
      }
    },
    onError: (error) => {
      let message = "Upload fehlgeschlagen. Bitte erneut versuchen.";
      if (isAxiosError(error)) {
        message = (error.response?.data as { error?: string } | undefined)?.error ?? message;
      } else if (error instanceof Error) {
        message = error.message;
      }
      toast({
        title: "Upload fehlgeschlagen",
        description: message,
        variant: "destructive",
      });
    },
  });

  const handleFocusFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setFocusUploadFile(file);
  };

  const handleFocusUpload = () => {
    if (!focusUploadFile) {
      toast({
        title: "Keine Datei ausgewählt",
        description: "Bitte wähle zuerst eine CSV- oder Excel-Datei mit Artikelnummern aus.",
        variant: "destructive",
      });
      return;
    }
    focusUploadMutation.mutate(focusUploadFile);
  };

  const filteredItems = useMemo(() => {
    return catalogItems.filter((item) => {
      if (onlyFavorites && !favorites.has(item.id)) {
        return false;
      }
      if (selectedVintage !== "all" && (item.vintage ?? "") !== selectedVintage) {
        return false;
      }
      if (hideZeroStock && item.stock != null && item.stock <= 0) {
        return false;
      }
      return true;
    });
  }, [catalogItems, favorites, hideZeroStock, onlyFavorites, selectedVintage]);

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      switch (sortOption) {
        case "stock":
          return (b.stock ?? 0) - (a.stock ?? 0);
        case "vintage":
          return (b.vintage ?? "").localeCompare(a.vintage ?? "");
        case "price": {
          const priceA = a.prices?.[0]?.value ?? Infinity;
          const priceB = b.prices?.[0]?.value ?? Infinity;
          return priceA - priceB;
        }
        case "name":
        default:
          return (a.wineName ?? "").localeCompare(b.wineName ?? "", "de");
      }
    });
  }, [filteredItems, sortOption]);

  const toggleFavorite = (item: CatalogSummaryItem) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
        toast({
          title: "Favorit entfernt",
          description: `${item.wineName ?? item.articleNumber ?? "Artikel"} wurde aus deinen Favoriten entfernt.`,
        });
      } else {
        next.add(item.id);
        toast({
          title: "Favorit gespeichert",
          description: `${item.wineName ?? item.articleNumber ?? "Artikel"} ist jetzt in deiner Favoritenliste.`,
        });
      }
      return next;
    });
  };

  const handleExport = (type: "excel" | "pdf") => {
    toast({
      title: `Export als ${type === "excel" ? "Excel" : "PDF"}`,
      description: "Die Exportfunktion wird mit der Admin-API verbunden.",
    });
  };

  const handleOpenWishlist = (item: CatalogSummaryItem) => {
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

  const handleQuickOrder = (item: CatalogSummaryItem) => {
    toast({
      title: "Bestellung vorbereiten",
      description: `Bestellung für ${item.wineName ?? item.articleNumber ?? "Artikel"} wird über die Admin-API angelegt (Platzhalter).`,
    });
  };

  const handleOpenPrice = (item: CatalogSummaryItem) => {
    setPriceItem(item);
    setPriceCustomer(sampleCustomersForComparison[0]?.id ?? "");
  };

  const getPricePreview = (item: CatalogSummaryItem | null, customerId: string) => {
    if (!item || !customerId) {
      return null;
    }
    const customer = sampleCustomersForComparison.find((entry) => entry.id === customerId);
    if (!customer) {
      return null;
    }
    const tierPrice = item.prices.find((price) => price.tier.toLowerCase() === customer.priceGroup.toLowerCase());
    if (!tierPrice) {
      return {
        customer,
        price: item.prices[0]?.value ?? null,
        discountedPrice: null,
      };
    }
    const netPrice = tierPrice.value ?? null;
    const discountedPrice = netPrice != null ? netPrice * (1 - customer.discount / 100) : null;
    return {
      customer,
      price: netPrice,
      discountedPrice,
    };
  };

  const detailPriceInfo = getPricePreview(priceItem, priceCustomer);
  const isLoading = catalogQuery.isLoading && !catalogQuery.isFetching;
  const hasError = catalogQuery.isError;

  return (
    <>
      <TopBar
        title="Sortiment"
        showSearch={false}
        actions={(
          <div className="flex items-center gap-3">
            {canUploadFocusList && (
              <Button
                variant="outline"
                className="gap-2 border-accent text-accent-600 hover:bg-accent/10"
                onClick={() => setFocusUploadOpen(true)}
                disabled={focusUploadMutation.isPending}
              >
                <UploadCloud className="h-4 w-4" />
                Fokusliste
              </Button>
            )}
            <Button
              variant={onlyFavorites ? "secondary" : "outline"}
              onClick={() => setOnlyFavorites((prev) => !prev)}
              className="gap-2"
            >
              {onlyFavorites ? <Heart className="h-4 w-4" /> : <HeartOff className="h-4 w-4" />}
              {onlyFavorites ? "Favoriten" : "Alle"}
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <FileDown className="h-4 w-4" />
                  Export
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 space-y-2">
                <Button variant="ghost" className="w-full justify-start" onClick={() => handleExport("excel")}>
                  Excel (.xlsx)
                </Button>
                <Button variant="ghost" className="w-full justify-start" onClick={() => handleExport("pdf")}>
                  PDF
                </Button>
              </PopoverContent>
            </Popover>
            <Button asChild className="gap-2">
              <Link href="/sortiment/linther-liste">Linther Liste</Link>
            </Button>
          </div>
        )}
      />
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col overflow-hidden">
          <div className="p-6 space-y-6 overflow-y-auto">
            <Card className="p-4">
              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Filter className="h-4 w-4" />
                    <span>Filter nach Artikelnummer, Weingut, Jahrgang oder Favoriten</span>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground" htmlFor="hide-zero-stock">
                    <Checkbox
                      id="hide-zero-stock"
                      className="h-4 w-4"
                      checked={hideZeroStock}
                      onCheckedChange={(checked) => setHideZeroStock(Boolean(checked))}
                    />
                    ohne Bestand ausblenden
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent-600">
                  <div>
                {focusListQuery.isLoading ? (
                  <span>Fokusliste wird geladen…</span>
                ) : focusListQuery.isError ? (
                  <span className="text-destructive">Fokusliste konnte nicht geladen werden.</span>
                ) : focusListQuery.data?.count ? (
                  <span>{focusListQuery.data.count} Fokusartikel aktiv</span>
                ) : (
                  <span>Keine Fokusartikel hinterlegt.</span>
                )}
                  </div>
                  {focusListLastUpdated && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span>Stand {focusListLastUpdated}</span>
                      {focusListQuery.data?.uploadedBy?.displayName && (
                        <span className="text-[11px] text-accent-600">
                          (von {focusListQuery.data.uploadedBy.displayName})
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="article-number">Artikelnummer</Label>
                    <Input
                      id="article-number"
                      placeholder="z. B. VN-100245"
                      value={articleNumber}
                      onChange={(event) => setArticleNumber(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="winery">Winzer / Weingut</Label>
                    <Select
                      value={selectedWinery}
                      onValueChange={(value) => setSelectedWinery(value)}
                    >
                      <SelectTrigger id="winery">
                        <SelectValue placeholder="Weingut auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle</SelectItem>
                        {availableWineries.map((winery) => (
                          <SelectItem key={winery.id} value={winery.id}>
                            {winery.name ?? "Unbekanntes Weingut"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vintage">Jahrgang</Label>
                    <Select
                      value={selectedVintage}
                      onValueChange={(value) => setSelectedVintage(value)}
                    >
                      <SelectTrigger id="vintage">
                        <SelectValue placeholder="Jahrgang auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle</SelectItem>
                        {availableVintages.map((year) => (
                          <SelectItem key={year} value={year}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sortierung</Label>
                    <Select
                      value={sortOption}
                      onValueChange={(value) => setSortOption(value as typeof sortOption)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sortierung auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">A-Z nach Weinname</SelectItem>
                        <SelectItem value="stock">Bestand (absteigend)</SelectItem>
                        <SelectItem value="vintage">Jahrgang (neueste zuerst)</SelectItem>
                        <SelectItem value="price">Preis VK1 (niedrigster zuerst)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </Card>

            {hasError ? (
              <Card className="border-dashed bg-destructive/10 p-8 text-center text-destructive">
                Sortiment konnte nicht geladen werden. Bitte versuche es erneut.
              </Card>
            ) : isLoading ? (
              <Card className="border-dashed bg-muted/40 p-8 text-center text-muted-foreground">
                Sortiment wird geladen...
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {sortedItems.map((item) => {
                  const isFavorite = favorites.has(item.id);
                  const articleNumberNormalized = normalizeArticleNumber(item.articleNumber);
                  const isFocus = articleNumberNormalized ? focusArticleSet.has(articleNumberNormalized) : false;
                  return (
                    <Card
                      key={item.id}
                      className={cn(
                        "relative group border border-border transition-shadow",
                        isFocus
                          ? "border-[2px] border-accent shadow-[0_0_0_2px_rgba(230,91,45,0.22)]"
                          : "border-border"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleFavorite(item)}
                        className="absolute right-3 top-3 rounded-full border border-border bg-background/80 p-2 text-muted-foreground transition hover:text-primary"
                        aria-label={isFavorite ? "Favorit entfernen" : "Zu Favoriten"}
                      >
                        {isFavorite ? <Star className="h-4 w-4 text-primary" /> : <StarOff className="h-4 w-4" />}
                      </button>
                      <CardHeader className="pr-14">
                        <CardTitle className="text-lg text-foreground">
                          {item.wineName ?? "Unbenannter Artikel"}
                          {item.vintage ? ` (${item.vintage})` : ""}
                        </CardTitle>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span>{item.winery ?? "Unbekanntes Weingut"}</span>
                          <span>•</span>
                          <span>{item.volume ?? "–"}</span>
                          <span>•</span>
                          <span>{item.articleNumber ?? "–"}</span>
                        </div>
                        {isFocus && (
                          <Badge variant="outline" className="mt-3 w-fit border-accent text-accent-600">
                            Fokuswein
                          </Badge>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {item.country && <Badge variant="secondary">{item.country}</Badge>}
                          {item.region && <Badge variant="secondary">{item.region}</Badge>}
                          {item.certifications.map((cert) => (
                            <Badge key={cert} variant="outline">
                              {cert}
                            </Badge>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="space-y-1">
                            <span className="text-muted-foreground">Verfügbar</span>
                            <p className="text-lg font-semibold text-foreground">
                              {item.stock != null ? `${item.stock.toLocaleString("de-DE")} Fl.` : "–"}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-muted-foreground">Preis VK1</span>
                            <p className="text-lg font-semibold text-foreground">
                              {formatCurrency(item.prices[0]?.value ?? null)}
                            </p>
                          </div>
                        </div>
                        {item.grapes.length > 0 && (
                          <div className="rounded-md border border-border/70 bg-muted/40 p-3 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Rebsorten:</span> {item.grapes.join(", ")}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button asChild variant="secondary" size="sm" className="gap-2">
                            <Link href={`/sortiment/${item.id}`}>
                              <PackageSearch className="h-4 w-4" />
                              Details
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => handleOpenPrice(item)}
                          >
                            <Percent className="h-4 w-4" />
                            Preisvergleich
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => handleOpenWishlist(item)}
                          >
                            <ListPlus className="h-4 w-4" />
                            Merkliste
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            className="gap-2"
                            onClick={() => handleQuickOrder(item)}
                          >
                            <ShoppingCart className="h-4 w-4" />
                            Bestellen
                          </Button>
                        </div>
                        {item.allocation && (
                          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                            <div className="flex items-center gap-2 font-medium">
                              <Sparkles className="h-4 w-4" />
                              Allokation aktiv: {item.allocation.quantity} Fl. reserviert
                            </div>
                            {item.allocation.note && (
                              <p className="mt-1 text-xs leading-relaxed">{item.allocation.note}</p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                {sortedItems.length === 0 && !catalogQuery.isFetching && (
                  <Card className="col-span-full border-dashed bg-muted/40 p-8 text-center text-muted-foreground">
                    Keine Artikel im aktuellen Filter gefunden.
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <Dialog
        open={focusUploadOpen}
        onOpenChange={(open) => {
          setFocusUploadOpen(open);
          if (!open) {
            setFocusUploadFile(null);
            if (focusFileInputRef.current) {
              focusFileInputRef.current.value = "";
            }
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fokusliste hochladen</DialogTitle>
            <DialogDescription>
              Lade eine CSV- oder Excel-Datei hoch. Es wird ausschließlich die erste Spalte (Artikelnummer) verwendet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="focus-upload">Datei auswählen</Label>
              <Input
                id="focus-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                ref={focusFileInputRef}
                onChange={handleFocusFileChange}
                disabled={focusUploadMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Erwartet werden Artikelnummern in der ersten Spalte. Doppelte Einträge werden automatisch entfernt.
              </p>
              {focusUploadFile && (
                <p className="text-xs font-medium text-foreground">Ausgewählt: {focusUploadFile.name}</p>
              )}
            </div>
            {focusListQuery.data && (
              <div className="rounded-md border border-dashed border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent-600">
                <p>
                  Aktuell hinterlegt: {focusListQuery.data.count} Artikel
                  {focusListLastUpdated ? ` · Stand ${focusListLastUpdated}` : ""}
                  {focusListQuery.data.uploadedBy?.displayName ? ` · von ${focusListQuery.data.uploadedBy.displayName}` : ""}
                </p>
              </div>
            )}
            {focusUploadMutation.isPending && (
              <p className="text-xs text-muted-foreground">Upload läuft… bitte warten.</p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-3">
            <Button
              type="button"
              variant="ghost"
              disabled={focusUploadMutation.isPending}
              onClick={() => {
                setFocusUploadOpen(false);
              }}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              onClick={handleFocusUpload}
              disabled={focusUploadMutation.isPending}
              className="gap-2"
            >
              <UploadCloud className="h-4 w-4" />
              Hochladen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={Boolean(priceItem)} onOpenChange={(open) => !open && setPriceItem(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Preisvergleich</DialogTitle>
            <DialogDescription>
              Kundenspezifische Preise basierend auf Preisgruppen und Rabatten.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {priceItem && (
              <div className="rounded border border-border/70 bg-muted/40 p-3 text-sm">
                <div className="font-semibold text-foreground">{priceItem.wineName ?? priceItem.articleNumber} {priceItem.vintage && `(${priceItem.vintage})`}</div>
                <div className="text-muted-foreground text-xs">
                  {priceItem.articleNumber ?? "–"} • {priceItem.winery ?? "Unbekanntes Weingut"}
                </div>
              </div>
            )}
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
                {detailPriceInfo ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Preisgruppe</span>
                      <span className="font-semibold">{detailPriceInfo.customer.priceGroup}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Listenpreis</span>
                      <span className="font-semibold">
                        {formatCurrency(detailPriceInfo.price)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Kundenrabatt</span>
                      <span className="font-semibold">{detailPriceInfo.customer.discount}%</span>
                    </div>
                    <div className="flex items-center justify-between text-base">
                      <span className="font-semibold text-foreground">Netto-Kundenpreis</span>
                      <span className="font-semibold text-primary">
                        {formatCurrency(detailPriceInfo.discountedPrice)}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Bitte wähle einen Kunden aus, um Preise zu sehen.</p>
                )}
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setPriceItem(null)}>
                Schließen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
