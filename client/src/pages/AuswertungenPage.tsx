import { useMemo, useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import TopBar from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  CalendarIcon,
  PieChart as PieChartIcon,
  ShoppingCart,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import api from "@/lib/api";
import type { AnalyticsSummaryResponse } from "@shared/types/analytics";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

type TimeRange = "month" | "quarter" | "year" | "custom";

const VINATUREL_PRIMARY = "#1f4b2b";
const VINATUREL_ACCENT = "#88a08d";

const salesTrendConfig: ChartConfig = {
  revenue: {
    label: "Umsatz",
    color: VINATUREL_PRIMARY,
  },
  previous: {
    label: "Vorjahr",
    color: VINATUREL_ACCENT,
  },
};

const topCustomerConfig: ChartConfig = {
  revenue: {
    label: "Umsatz",
    color: VINATUREL_PRIMARY,
  },
};

const assortmentConfig: ChartConfig = {
  region: {
    label: "Anteil",
    color: "hsl(var(--chart-2))",
  },
};

const returnsConfig: ChartConfig = {
  returns: {
    label: "Retouren",
    color: "hsl(var(--destructive))",
  },
  accepted: {
    label: "Erledigt",
    color: "hsl(var(--chart-3))",
  },
};

const SALES_TABS = [
  { id: "sales", label: "Vertrieb" },
  { id: "assortment", label: "Sortiment" },
  { id: "customers", label: "Kunden" },
  { id: "goals", label: "Ziele" },
  { id: "addons", label: "Zusatzmodule" },
];

const ASSORTMENT_DISTRIBUTION = [
  { name: "Region Süd", value: 32 },
  { name: "Region Nord", value: 24 },
  { name: "Region Mitte", value: 22 },
  { name: "Export", value: 14 },
  { name: "Direktvertrieb", value: 8 },
];

const TOP_PRODUCTS = [
  { sku: "VN-1001", name: "Riesling Reserve 2022", quantity: 480, revenue: 25800 },
  { sku: "VN-1024", name: "Pinot Noir Edition", quantity: 360, revenue: 31150 },
  { sku: "VN-1032", name: "Sauvignon Blanc Bio", quantity: 340, revenue: 19880 },
  { sku: "VN-1047", name: "Chardonnay Grande", quantity: 320, revenue: 28740 },
  { sku: "VN-1053", name: "Rosé Sommertraum", quantity: 295, revenue: 15480 },
];

const SLOW_MOVERS = [
  { sku: "VN-2004", name: "Merlot Prestige 2018", stock: 210 },
  { sku: "VN-2011", name: "Grauburgunder Classic", stock: 156 },
  { sku: "VN-2027", name: "Cuvée Noir Reserve", stock: 134 },
];

const HEATMAP = [
  { day: "Mo", values: [0, 3, 4, 2, 1, 0] },
  { day: "Di", values: [1, 4, 5, 3, 2, 1] },
  { day: "Mi", values: [2, 5, 6, 4, 2, 2] },
  { day: "Do", values: [3, 6, 7, 5, 3, 2] },
  { day: "Fr", values: [2, 4, 5, 3, 1, 1] },
  { day: "Sa", values: [1, 2, 3, 1, 0, 0] },
  { day: "So", values: [0, 1, 1, 0, 0, 0] },
];

const INACTIVE_CUSTOMERS = [
  { name: "Weinothek Altes Rathaus", lastOrder: "12.02.2024", days: 119 },
  { name: "Restaurant Fontana", lastOrder: "22.01.2024", days: 140 },
  { name: "Feinkost Krämer", lastOrder: "14.12.2023", days: 179 },
];

const OPEN_TODOS = [
  { id: "TD-042", customer: "Vinum Select", topic: "Angebot nachfassen", due: "15.06.2024" },
  { id: "TD-038", customer: "Gastro Nord", topic: "Rückruf bzgl. Liefertermin", due: "14.06.2024" },
  { id: "TD-035", customer: "Handelshaus Merlot", topic: "Verkostung planen", due: "20.06.2024" },
];

const OPEN_INVOICES = [
  { customer: "Feinkost Loeb", amount: 2840, dueIn: "7 Tage" },
  { customer: "Weinbar 21", amount: 1920, dueIn: "12 Tage" },
  { customer: "Hotel Sonnberg", amount: 5210, dueIn: "Überfällig" },
];

const RETURNS = [
  { name: "Retourenquote", value: 6 },
  { name: "Erfolgreich bearbeitet", value: 94 },
];

const HEATMAP_LEVELS = ["bg-muted", "bg-primary/10", "bg-primary/20", "bg-primary/40", "bg-primary/60", "bg-primary/80", "bg-primary"];

function formatCurrency(value: number | null | undefined, currency = "EUR") {
  if (value === null || value === undefined) {
    return "–";
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "–";
  }

  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(numericValue);
  } catch (error) {
    return numericValue.toLocaleString("de-DE");
  }
}

function calculatePercentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }

  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatSignedPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "–";
  }

  const formatter = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });

  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  const formatted = formatter.format(Math.abs(value));
  return `${prefix}${formatted} %`;
}

function formatSignedInteger(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "–";
  }

  if (value > 0) {
    return `+${value.toLocaleString("de-DE")}`;
  }

  if (value < 0) {
    return value.toLocaleString("de-DE");
  }

  return "0";
}

function formatAxisValue(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "0";
  }

  const absValue = Math.abs(value);
  if (absValue >= 1_000_000) {
    return `${Math.round(value / 1_000_000)}M`;
  }

  if (absValue >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }

  return value.toLocaleString("de-DE");
}

export default function AuswertungenPage() {
  const [period, setPeriod] = useState<TimeRange>("month");
  const [group, setGroup] = useState("all");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const handlePeriodChange = (value: TimeRange) => {
    setPeriod(value);
    if (value !== "custom") {
      setCustomRange(undefined);
    }
  };

  const headline = useMemo(() => {
    const today = new Date();

    switch (period) {
      case "month":
        return format(today, "LLLL yyyy", { locale: de });
      case "year": {
        const currentYear = today.getFullYear();
        const isNewFiscalYear = today.getMonth() >= 6; // July (0-indexed 6)
        const startYear = isNewFiscalYear ? currentYear : currentYear - 1;
        const endYear = startYear + 1;
        return `Geschäftsjahr ${startYear}/${endYear}`;
      }
      case "quarter":
        return "Aktuelles Quartal";
      case "custom":
      default:
        return "Benutzerdefiniert";
    }
  }, [period]);

  const customRangeLabel = useMemo(() => {
    if (!customRange?.from && !customRange?.to) {
      return "Zeitraum wählen";
    }

    if (customRange.from && customRange.to) {
      return `${format(customRange.from, "dd.MM.yyyy")} – ${format(customRange.to, "dd.MM.yyyy")}`;
    }

    if (customRange.from) {
      return `${format(customRange.from, "dd.MM.yyyy")} – offen`;
    }

    if (customRange.to) {
      return `offen – ${format(customRange.to, "dd.MM.yyyy")}`;
    }

    return "Zeitraum wählen";
  }, [customRange]);

  const customFromParam = customRange?.from ? format(customRange.from, "yyyy-MM-dd") : undefined;
  const customToParam = customRange?.to ? format(customRange.to, "yyyy-MM-dd") : undefined;

  const analyticsQuery = useQuery<AnalyticsSummaryResponse>({
    queryKey: [
      "analytics-summary",
      {
        period,
        group,
        from: customFromParam ?? null,
        to: customToParam ?? null,
      },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      params.set("group", group);

      if (period === "custom") {
        if (customFromParam) {
          params.set("from", customFromParam);
        }
        if (customToParam) {
          params.set("to", customToParam);
        }
      }

      const response = await api.get("/admin-api/analytics/summary", { params });
      return response.data as AnalyticsSummaryResponse;
    },
    enabled: period !== "custom" || Boolean(customFromParam && customToParam),
  });

  const analyticsSummary = analyticsQuery.data;
  const analyticsLoading = analyticsQuery.isLoading;
  const analyticsFetching = analyticsQuery.isFetching;

  const analyticsBusy = analyticsLoading || analyticsFetching;

  const positiveDeltaClass = "text-emerald-600 dark:text-emerald-500";
  const negativeDeltaClass = "text-red-600 dark:text-red-400";
  const neutralDeltaClass = "text-muted-foreground";

  const revenueTotals = analyticsSummary?.totals?.revenue;
  const revenueCurrency = revenueTotals?.currency ?? "EUR";
  const revenueCurrent = revenueTotals?.current ?? null;
  const revenuePrevious = revenueTotals?.previous ?? null;
  const revenueValue = formatCurrency(revenueCurrent, revenueCurrency);
  const revenuePercentChange =
    revenueCurrent != null && revenuePrevious != null
      ? calculatePercentChange(revenueCurrent, revenuePrevious)
      : null;
  const revenueDeltaLabel = revenueTotals
    ? `${formatSignedPercent(revenuePercentChange)} vs. Vorjahr`
    : analyticsBusy
      ? "Lädt..."
      : "–";
  const revenueDeltaClass = revenueTotals && revenuePercentChange != null
    ? revenuePercentChange >= 0
      ? positiveDeltaClass
      : negativeDeltaClass
    : neutralDeltaClass;

  const orderTotals = analyticsSummary?.totals?.orders;
  const ordersCurrent = orderTotals?.current ?? null;
  const ordersPrevious = orderTotals?.previous ?? null;
  const ordersValue =
    ordersCurrent != null
      ? ordersCurrent.toLocaleString("de-DE")
      : "–";
  const orderDifference =
    ordersCurrent != null && ordersPrevious != null
      ? ordersCurrent - ordersPrevious
      : null;
  const ordersDeltaLabel = orderTotals
    ? `${formatSignedInteger(orderDifference)} vs. Vorjahr`
    : analyticsBusy
      ? "Lädt..."
      : "–";
  const ordersDeltaClass = orderTotals && orderDifference != null
    ? orderDifference >= 0
      ? positiveDeltaClass
      : negativeDeltaClass
    : neutralDeltaClass;

  const kpis = useMemo(
    () => [
      {
        label: "Umsatz gesamt",
        value: revenueValue,
        delta: revenueDeltaLabel,
        deltaClassName: revenueDeltaClass,
        icon: BarChart3,
      },
      {
        label: "Bestellungen",
        value: ordersValue,
        delta: ordersDeltaLabel,
        deltaClassName: ordersDeltaClass,
        icon: ShoppingCart,
      },
      {
        label: "Neukunden",
        value: "9",
        delta: "+3 im Vergleich",
        deltaClassName: positiveDeltaClass,
        icon: Users,
      },
      {
        label: "Offene Angebote",
        value: "24",
        delta: "12 fällig diese Woche",
        deltaClassName: neutralDeltaClass,
        icon: Target,
      },
    ],
    [
      revenueValue,
      revenueDeltaLabel,
      revenueDeltaClass,
      ordersValue,
      ordersDeltaLabel,
      ordersDeltaClass,
      positiveDeltaClass,
      neutralDeltaClass,
    ],
  );

  const analyticsCurrency = analyticsSummary?.currency ?? revenueCurrency;

  const trendData = (analyticsSummary?.trend ?? []).map((point) => ({
    month: point.month,
    label: point.label,
    revenue: point.current,
    previous: point.previous,
  }));

  const defaultOrderCurrency = analyticsSummary?.currency ?? "EUR";
  const ordersRaw = analyticsSummary?.orders ?? [];

  const periodOrders = useMemo(
    () =>
      ordersRaw.map((order) => {
        const orderDateLabel = order.orderDate ? format(new Date(order.orderDate), "dd.MM.yyyy") : "–";
        const customerFullName =
          [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ").trim() ||
          order.customerName ||
          "–";

        return {
          id: order.id,
          orderNumber: order.orderNumber ?? "–",
          orderDate: orderDateLabel,
          amountLabel: formatCurrency(order.amount ?? 0, order.currency ?? defaultOrderCurrency),
          customerCompany: order.customerCompany ?? "–",
          customerFullName,
          customerNumber: order.customerNumber ?? "–",
          customerId: order.customerId,
        };
      }),
    [ordersRaw, defaultOrderCurrency]
  );

  const handleOrderNumberClick = (order: (typeof periodOrders)[number]) => {
    if (order.customerId) {
      navigate(`/customer/${order.customerId}?orderId=${order.id}`);
    } else {
      toast({
        title: 'Keine Bestellung verfügbar',
        description: 'Für diese Bestellung liegt keine Kundenverknüpfung vor.',
        variant: 'destructive'
      });
    }
  };

  const handleCustomerNavigate = (customerId: string | null | undefined) => {
    if (customerId) {
      navigate(`/customer/${customerId}`);
    } else {
      toast({
        title: 'Kundenakte nicht verfügbar',
        description: 'Für diesen Datensatz gibt es keine zuweisbare Kundenakte.',
        variant: 'destructive'
      });
    }
  };

  const topCustomersRaw = analyticsSummary?.topCustomers ?? [];
  const topCustomersChartData = topCustomersRaw.map((entry) => ({
    name: entry.name,
    revenue: entry.revenue,
    customerId: entry.customerId ?? null,
    shopwareCustomerId: entry.shopwareCustomerId ?? null,
    orderNumber: entry.orderNumber ?? null,
  }));

  const handleTopCustomerBarClick = (payload?: typeof topCustomersChartData[number]) => {
    if (!payload) {
      return;
    }

    if (payload.customerId) {
      navigate(`/customer/${payload.customerId}`);
    } else {
      toast({
        title: 'Keine Kundendetails verfügbar',
        description: payload.orderNumber
          ? `Gastbestellung ${payload.orderNumber}. Bitte Kunde manuell zuordnen.`
          : 'Für diesen Umsatz liegen keine zuweisbaren Kundendaten vor.',
        variant: 'destructive'
      });
    }
  };

  const formatTooltipValue = (rawValue: number | string) => {
    const numeric = typeof rawValue === "number" ? rawValue : Number(rawValue);
    return formatCurrency(Number.isFinite(numeric) ? numeric : 0, analyticsCurrency);
  };

  return (
    <>
      <TopBar title="Auswertungen" showSearch={false} />
      <main className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col overflow-hidden">
          <div className="space-y-6 overflow-y-auto p-6">
            <Card>
              <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>{headline}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Filtere deine Kennzahlen nach Zeitraum und Kundengruppe.
                  </p>
                </div>
                <Button variant="outline" size="sm">Als Favorit speichern</Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="period-select">Zeitraum</Label>
                    <Select value={period} onValueChange={(value) => handlePeriodChange(value as TimeRange)}>
                      <SelectTrigger id="period-select">
                        <SelectValue placeholder="Zeitraum wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="month">Aktueller Monat</SelectItem>
                        <SelectItem value="quarter">Quartal</SelectItem>
                        <SelectItem value="year">Jahr</SelectItem>
                        <SelectItem value="custom">Benutzerdefiniert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="group-select">Kundengruppe</Label>
                    <Select value={group} onValueChange={setGroup}>
                      <SelectTrigger id="group-select">
                        <SelectValue placeholder="Kundengruppe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle</SelectItem>
                        <SelectItem value="gastro">Gastro</SelectItem>
                        <SelectItem value="fachhandel">Fachhandel</SelectItem>
                        <SelectItem value="endkunden">Endkunden</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {period === "custom" && (
                  <div className="mt-4 space-y-2">
                    <Label>Eigener Zeitraum</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start gap-2 text-left font-normal"
                        >
                          <CalendarIcon className="h-4 w-4" />
                          <span>{customRangeLabel}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="range"
                          selected={customRange}
                          onSelect={(range) => setCustomRange(range)}
                          numberOfMonths={2}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">
                      Wähle Start- und Enddatum für deine Analyse.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {kpis.map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <Card key={kpi.label} className="group flex flex-col justify-between">
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">{kpi.label}</p>
                        <p className="text-2xl font-semibold text-foreground">{kpi.value}</p>
                        <p className={`text-xs ${kpi.deltaClassName ?? positiveDeltaClass}`}>{kpi.delta}</p>
                      </div>
                      <span className="rounded-lg bg-primary/10 p-2 text-primary group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="h-5 w-5" />
                      </span>
                    </CardHeader>
                    <CardContent>
                      <Button variant="link" size="sm" className="px-0">
                        Details öffnen
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Tabs defaultValue="sales" className="space-y-6">
              <TabsList className="w-full justify-start overflow-x-auto">
                {SALES_TABS.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} className="whitespace-nowrap">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="sales" className="space-y-6">
                <div className="flex flex-col gap-6 xl:flex-row">
                  <Card className="flex-1">
                    <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <CardTitle>Umsatzentwicklung</CardTitle>
                        <p className="text-xs text-muted-foreground">Letzte 12 Monate im Vergleich zum Vorjahr</p>
                      </div>
                      <Button variant="link" size="sm" className="-mx-2">
                        Verlauf öffnen
                      </Button>
                    </CardHeader>
                    <CardContent>
                      {trendData.length > 0 ? (
                        <>
                          <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: VINATUREL_PRIMARY }}
                              />
                              <span className="font-medium text-foreground">Aktuelles Jahr</span>
                            </span>
                            <span className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: VINATUREL_ACCENT }}
                              />
                              <span className="font-medium text-foreground">Vorjahr</span>
                            </span>
                          </div>
                          <ChartContainer config={salesTrendConfig} className="h-64">
                            <AreaChart data={trendData}>
                              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                              <YAxis
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => formatAxisValue(value as number)}
                              />
                              <Tooltip
                                content={
                                  <ChartTooltipContent
                                    indicator="line"
                                    formatter={(value) => formatTooltipValue(value as number | string)}
                                  />
                                }
                              />
                              <Area
                                type="monotone"
                                dataKey="revenue"
                                stroke="var(--color-revenue)"
                                strokeWidth={3}
                                fill={VINATUREL_PRIMARY}
                                fillOpacity={0.15}
                              />
                              <Area
                                type="monotone"
                                dataKey="previous"
                                stroke="var(--color-previous)"
                                strokeWidth={2}
                                strokeDasharray="6 4"
                                fill={VINATUREL_ACCENT}
                                fillOpacity={0.12}
                              />
                            </AreaChart>
                          </ChartContainer>
                        </>
                      ) : (
                        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                          {analyticsBusy ? 'Lade Umsatzverlauf…' : 'Keine Umsatzdaten vorhanden.'}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="flex-1">
                    <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <CardTitle>Top-10-Kunden nach Umsatz</CardTitle>
                        <p className="text-xs text-muted-foreground">Ranking für den gewählten Zeitraum</p>
                      </div>
                      <Button variant="link" size="sm" className="-mx-2">
                        Ranking anzeigen
                      </Button>
                    </CardHeader>
                    <CardContent>
                      {topCustomersChartData.length > 0 ? (
                        <ChartContainer config={topCustomerConfig} className="h-64">
                          <BarChart data={topCustomersChartData.slice(0, 10)}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                            <YAxis
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(value) => formatAxisValue(value as number)}
                            />
                            <Tooltip
                              content={
                                <ChartTooltipContent
                                  formatter={(value) => formatTooltipValue(value as number | string)}
                                />
                              }
                            />
                            <Bar
                              dataKey="revenue"
                              fill={VINATUREL_PRIMARY}
                              radius={[6, 6, 0, 0]}
                              cursor="pointer"
                              onClick={(_data, index) => handleTopCustomerBarClick(topCustomersChartData[index])}
                            />
                          </BarChart>
                        </ChartContainer>
                      ) : (
                        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                          {analyticsBusy ? 'Lade Kundendaten…' : 'Keine Umsatzdaten für Kunden vorhanden.'}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle>Bestellungen im Zeitraum</CardTitle>
                      <p className="text-xs text-muted-foreground">Direkt in die Detailansicht springen.</p>
                    </div>
                    <Button variant="link" size="sm" className="-mx-2">
                      Export starten
                    </Button>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Bestellnummer</TableHead>
                          <TableHead>Unternehmen</TableHead>
                          <TableHead>Vor- & Nachname</TableHead>
                          <TableHead>Kundennummer</TableHead>
                          <TableHead>Bestelldatum</TableHead>
                          <TableHead>Umsatz</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {periodOrders.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                              {analyticsBusy ? 'Lade Bestellungen…' : 'Keine Bestellungen im ausgewählten Zeitraum gefunden.'}
                            </TableCell>
                          </TableRow>
                        ) : (
                          periodOrders.map((order) => (
                            <TableRow key={order.id}>
                              <TableCell className="font-medium">
                                <button
                                  type="button"
                                  onClick={() => handleOrderNumberClick(order)}
                                  className="text-primary underline-offset-2 hover:underline"
                                >
                                  {order.orderNumber}
                                </button>
                              </TableCell>
                              <TableCell>
                                <button
                                  type="button"
                                  onClick={() => handleCustomerNavigate(order.customerId)}
                                  className="text-primary underline-offset-2 hover:underline"
                                >
                                  {order.customerCompany}
                                </button>
                              </TableCell>
                              <TableCell>
                                <button
                                  type="button"
                                  onClick={() => handleCustomerNavigate(order.customerId)}
                                  className="text-primary underline-offset-2 hover:underline"
                                >
                                  {order.customerFullName}
                                </button>
                              </TableCell>
                              <TableCell>
                                <button
                                  type="button"
                                  onClick={() => handleCustomerNavigate(order.customerId)}
                                  className="text-primary underline-offset-2 hover:underline"
                                >
                                  {order.customerNumber}
                                </button>
                              </TableCell>
                              <TableCell>{order.orderDate}</TableCell>
                              <TableCell>{order.amountLabel}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="assortment" className="space-y-6">
                <div className="flex flex-col gap-6 xl:flex-row">
                  <Card className="flex-1">
                    <CardHeader className="flex items-start justify-between">
                      <div>
                        <CardTitle>Umsatzanteil nach Segment</CardTitle>
                        <p className="text-xs text-muted-foreground">Region / Rebsorte / Preisgruppe</p>
                      </div>
                      <Button variant="link" size="sm" className="-mx-2">
                        Pivot öffnen
                      </Button>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <ChartContainer config={assortmentConfig} className="h-64">
                        <PieChart>
                          <Pie data={ASSORTMENT_DISTRIBUTION} dataKey="value" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={4}>
                            {ASSORTMENT_DISTRIBUTION.map((entry, index) => (
                              <Cell key={entry.name} fill={`var(--chart-${(index % 6) + 1})`} />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltipContent />} />
                        </PieChart>
                      </ChartContainer>
                      <div className="grid gap-2 text-sm">
                        {ASSORTMENT_DISTRIBUTION.map((entry, index) => (
                          <div key={entry.name} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: `hsl(var(--chart-${(index % 6) + 1}))` }}
                              />
                              <span>{entry.name}</span>
                            </div>
                            <span className="text-muted-foreground">{entry.value}%</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="flex-1">
                    <CardHeader className="flex items-start justify-between">
                      <div>
                        <CardTitle>Top-10-Produkte</CardTitle>
                        <p className="text-xs text-muted-foreground">Mengen- und Umsatzwerte</p>
                      </div>
                      <Button variant="link" size="sm" className="-mx-2">
                        Produktliste öffnen
                      </Button>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Artikel</TableHead>
                            <TableHead>Menge</TableHead>
                            <TableHead>Umsatz</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {TOP_PRODUCTS.map((product) => (
                            <TableRow key={product.sku}>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-medium">{product.name}</span>
                                  <span className="text-xs text-muted-foreground">{product.sku}</span>
                                </div>
                              </TableCell>
                              <TableCell>{product.quantity.toLocaleString("de-DE")}</TableCell>
                              <TableCell>{formatCurrency(product.revenue)}</TableCell>
                              <TableCell className="text-right">
                                <Button variant="link" size="sm">
                                  Analyse
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle>Ladenhüter</CardTitle>
                      <p className="text-xs text-muted-foreground">Artikel mit geringer Rotation in den letzten 6 Monaten</p>
                    </div>
                    <Button variant="link" size="sm" className="-mx-2">
                      Maßnahmen planen
                    </Button>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-3">
                    {SLOW_MOVERS.map((item) => (
                      <div key={item.sku} className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-4">
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.sku}</p>
                        <p className="mt-4 text-sm text-muted-foreground">Bestand im Lager</p>
                        <p className="text-2xl font-semibold text-foreground">{item.stock}</p>
                        <Button variant="link" size="sm" className="px-0">
                          Detail öffnen
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="customers" className="space-y-6">
                <Card>
                  <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle>Kundenaktivität</CardTitle>
                      <p className="text-xs text-muted-foreground">Kontaktpunkte und Bestellungen als Heatmap</p>
                    </div>
                    <Button variant="link" size="sm" className="-mx-2">
                      Kalender öffnen
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-[auto,1fr]">
                      <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                        {HEATMAP.map((row) => (
                          <span key={row.day} className="h-8 leading-8">
                            {row.day}
                          </span>
                        ))}
                      </div>
                      <div className="grid auto-cols-fr grid-flow-col gap-2">
                        {HEATMAP[0].values.map((_, columnIndex) => (
                          <div key={`column-${columnIndex}`} className="grid gap-2">
                            {HEATMAP.map((row, rowIndex) => {
                              const intensity = row.values[columnIndex];
                              const level = HEATMAP_LEVELS[Math.min(intensity, HEATMAP_LEVELS.length - 1)];
                              return (
                                <button
                                  key={`${row.day}-${columnIndex}`}
                                  type="button"
                                  className={`h-8 w-8 rounded ${level} transition hover:scale-110`}
                                  aria-label={`${row.day}: ${intensity} Aktivitäten`}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded bg-muted" /> 0 Aktivitäten
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded bg-primary/40" /> 3 Aktivitäten
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded bg-primary/80" /> 7 Aktivitäten
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="flex items-center justify-between">
                      <CardTitle>Inaktive Kunden</CardTitle>
                      <Button variant="link" size="sm" className="-mx-2">
                        Reaktivierungsplan
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {INACTIVE_CUSTOMERS.map((customer) => (
                        <div key={customer.name} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-foreground">{customer.name}</p>
                              <p className="text-xs text-muted-foreground">Letzte Bestellung: {customer.lastOrder}</p>
                            </div>
                            <Badge variant="secondary">{customer.days} Tage</Badge>
                          </div>
                          <Button variant="link" size="sm" className="px-0">
                            Zum Kunden springen
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex items-center justify-between">
                      <CardTitle>Offene To-Dos</CardTitle>
                      <Button variant="link" size="sm" className="-mx-2">
                        Aufgaben anzeigen
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {OPEN_TODOS.map((todo) => (
                        <div key={todo.id} className="flex items-center justify-between rounded border border-border/60 bg-muted/30 px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">{todo.topic}</p>
                            <p className="text-xs text-muted-foreground">{todo.customer}</p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <p>Fällig am {todo.due}</p>
                            <Button variant="link" size="sm" className="px-0">
                              Details
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="goals" className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="flex items-center justify-between">
                      <CardTitle>Persönliches Umsatzziel</CardTitle>
                      <Badge variant="outline">75 % erreicht</Badge>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between text-sm">
                        <span>Aktueller Umsatz</span>
                        <Button variant="link" size="sm" className="px-0">
                          Details
                        </Button>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <p className="text-3xl font-semibold text-foreground">{formatCurrency(375000)}</p>
                        <span className="text-sm text-muted-foreground">Ziel: {formatCurrency(500000)}</span>
                      </div>
                      <Progress value={75} className="h-2" />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex items-center justify-between">
                      <CardTitle>Teamvergleich</CardTitle>
                      <Badge variant="secondary">+12 %</Badge>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Du liegst aktuell 12 % über dem anonymisierten Teamdurchschnitt.
                      </p>
                      <div className="grid gap-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span>Dein Umsatz</span>
                          <span className="font-medium text-foreground">{formatCurrency(375000)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Teamdurchschnitt</span>
                          <span className="text-muted-foreground">{formatCurrency(335000)}</span>
                        </div>
                      </div>
                      <Button variant="link" size="sm" className="px-0">
                        Detailvergleich öffnen
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <CardTitle>Abschlussquote</CardTitle>
                    <Button variant="link" size="sm" className="-mx-2">
                      Angebotsanalyse
                    </Button>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span>Gewonnene Aufträge</span>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      </div>
                      <p className="mt-3 text-3xl font-semibold text-foreground">38</p>
                      <Button variant="link" size="sm" className="px-0">
                        Aufträge ansehen
                      </Button>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span>Angebote gesamt</span>
                        <TrendingUp className="h-4 w-4 text-primary" />
                      </div>
                      <p className="mt-3 text-3xl font-semibold text-foreground">72</p>
                      <Button variant="link" size="sm" className="px-0">
                        Pipeline öffnen
                      </Button>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span>Abschlussquote</span>
                        <Activity className="h-4 w-4 text-sky-500" />
                      </div>
                      <p className="mt-3 text-3xl font-semibold text-foreground">52 %</p>
                      <Button variant="link" size="sm" className="px-0">
                        Chancen analysieren
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="addons" className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="flex items-start justify-between">
                      <div>
                        <CardTitle>Retouren & Reklamationen</CardTitle>
                        <p className="text-xs text-muted-foreground">Verteilung nach Gründen</p>
                      </div>
                      <Button variant="link" size="sm" className="-mx-2">
                        Fälle anzeigen
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ChartContainer config={returnsConfig} className="h-56">
                        <PieChart>
                          <Pie data={RETURNS} innerRadius={50} outerRadius={100} dataKey="value" nameKey="name">
                            {RETURNS.map((entry, index) => (
                              <Cell key={entry.name} fill={`var(--chart-${index + 1})`} />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltipContent />} />
                        </PieChart>
                      </ChartContainer>
                      <div className="grid gap-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span>Retourenquote</span>
                          <span className="font-medium text-foreground">6 %</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Häufigster Grund</span>
                          <span className="text-muted-foreground">Korkschmecker</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex items-start justify-between">
                      <div>
                        <CardTitle>Offene Rechnungen</CardTitle>
                        <p className="text-xs text-muted-foreground">Schneller Blick vor Kundenbesuch</p>
                      </div>
                      <Button variant="link" size="sm" className="-mx-2">
                        Mahnwesen öffnen
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {OPEN_INVOICES.map((invoice) => (
                        <div key={invoice.customer} className="flex items-center justify-between rounded border border-border/60 bg-muted/30 px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">{invoice.customer}</p>
                            <p className="text-xs text-muted-foreground">Fälligkeit: {invoice.dueIn}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-foreground">{formatCurrency(invoice.amount)}</p>
                            <Button variant="link" size="sm" className="px-0">
                              Details
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="flex items-start justify-between">
                    <div>
                      <CardTitle>Geografische Karte</CardTitle>
                      <p className="text-xs text-muted-foreground">Kunden nach Umsatz für die Routenplanung</p>
                    </div>
                    <Button variant="link" size="sm" className="-mx-2">
                      Karte öffnen
                    </Button>
                  </CardHeader>
                  <CardContent className="h-64 rounded-lg border border-dashed border-border/70 bg-muted/20">
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                      <PieChartIcon className="h-6 w-6" />
                      <p>Interaktive Karte hier integrieren (z. B. Mapbox oder Leaflet).</p>
                      <Button variant="link" size="sm" className="px-0">
                        Zu Kundenkarte springen
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </>
  );
}
