import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  Download,
  ListPlus,
  RefreshCcw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { MapCustomer } from "@shared/types/map-customer";
import type { SalesRepProfile } from "@shared/types/sales-rep";
import { fetchAllCustomers } from "@/lib/customerApi";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const REGION_SEGMENTS: Array<{ id: string; label: string; prefixes: string[] }> = [
  { id: "north", label: "Nord (PLZ 0-2)", prefixes: ["0", "1", "2"] },
  { id: "west", label: "West (PLZ 3-4)", prefixes: ["3", "4"] },
  { id: "east", label: "Ost (PLZ 0, 8-9)", prefixes: ["0", "8", "9"] },
  { id: "south", label: "Süd (PLZ 7-8)", prefixes: ["7", "8"] },
  { id: "center", label: "Mitte (PLZ 5-6)", prefixes: ["5", "6"] },
];

const GRAPE_VARIETIES = [
  "Riesling",
  "Spätburgunder",
  "Chardonnay",
  "Weißburgunder",
  "Sauvignon Blanc",
  "Silvaner",
  "Grauburgunder",
  "Merlot",
  "Cabernet Sauvignon",
  "Lemberger",
] as const;

const PAYMENT_STATES = ["ok", "überfällig", "gesperrt"] as const;
const OPT_IN_STATES = ["Opt-in", "Opt-out", "Ausstehend"] as const;
const STOCK_STATES = ["Verfügbar", "Niedrig", "Back in Stock"] as const;

const createId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `seg_${Math.random().toString(36).slice(2, 9)}`);

const isLikelyFullName = (value?: string | null) => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("@")) return false;
  return /\s/.test(trimmed);
};

const toTitleCase = (value: string) =>
  value
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const fallbackNameFromEmail = (email?: string | null) => {
  if (!email) return null;
  const localPart = email.split("@")[0];
  if (!/[a-zA-Z]/.test(localPart)) return null;
  const sanitized = localPart.replace(/^rep[-_]?/, "");
  if (!/[a-zA-Z]/.test(sanitized)) return null;
  return toTitleCase(sanitized);
};

const selectSalesRepName = (
  candidates: Array<string | null | undefined>,
  fallback?: string | null
) => {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    if (isLikelyFullName(trimmed)) {
      return trimmed;
    }
  }

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    if (!trimmed.includes("@") && !/\d/.test(trimmed)) {
      return toTitleCase(trimmed);
    }
  }

  return fallback ?? null;
};

const normaliseText = (value?: string | null) => value?.toLowerCase().trim() ?? "";

const extractPostalCode = (customer: MapCustomer) => {
  if (customer.zip) return customer.zip;
  if (!customer.address) return null;
  const match = customer.address.match(/\b\d{5}\b/);
  return match ? match[0] : null;
};

const deriveRegionId = (postalCode: string | null) => {
  if (!postalCode || postalCode.length === 0) return null;
  const prefix = postalCode[0];
  const region = REGION_SEGMENTS.find((segment) => segment.prefixes.includes(prefix));
  return region?.id ?? null;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const mapCustomerGroupToType = (group?: string | null) => {
  const raw = group?.trim() ?? "";
  if (!raw) return "Fachhandel";
  const normalized = raw.toLowerCase();
  if (/(gastro|gastronomie|ho(re)ca)/.test(normalized)) return "Gastro";
  if (/(fh|fachhandel|b2b|handel)/.test(normalized)) return "Fachhandel";
  if (/(endkunde|privat|b2c)/.test(normalized)) return "Endkunde";
  return toTitleCase(raw);
};

const deriveMarketingProfile = (customer: MapCustomer) => {
  const postalCode = extractPostalCode(customer);
  const regionId = deriveRegionId(postalCode);
  const type = mapCustomerGroupToType(customer.customerGroup);
  const numericRevenue = customer.totalRevenue ? Number.parseFloat(customer.totalRevenue) : null;
  const revenue = Number.isFinite(numericRevenue) ? numericRevenue ?? null : null;
  const lastContact = customer.lastContact ? new Date(customer.lastContact) : null;
  const daysSinceLastContact = lastContact ? Math.floor((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24)) : null;

  const hashBase = `${customer.id}|${customer.customerGroup ?? ""}|${customer.priceGroup ?? ""}`;
  const hash = hashString(hashBase);
  const grapeVariety = GRAPE_VARIETIES[hash % GRAPE_VARIETIES.length];
  const focusWineTag = hash % 4 === 0;
  const paymentStatus = PAYMENT_STATES[hash % PAYMENT_STATES.length];
  const optInStatus = OPT_IN_STATES[hash % OPT_IN_STATES.length];
  const stockStatus = STOCK_STATES[hash % STOCK_STATES.length];

  return {
    postalCode,
    regionId,
    customerType: type,
    grapeVariety,
    focusWineTag,
    revenue,
    daysSinceLastContact,
    paymentStatus,
    optInStatus,
    stockStatus,
    priceGroup: customer.priceGroup ? customer.priceGroup.toUpperCase() : null,
  } as const;
};

interface MarketingCustomer extends MapCustomer {
  marketing: ReturnType<typeof deriveMarketingProfile> & {
    salesRepName: string | null;
  };
}

type SegmentType = "smart" | "static";

type SegmentFilterKey =
  | "postalPrefix"
  | "region"
  | "salesRep"
  | "customerType"
  | "manufacturer"
  | "grapeVariety"
  | "focusWineTag"
  | "revenueRange"
  | "orderCount"
  | "lastInteraction"
  | "paymentStatus"
  | "optInStatus"
  | "priceGroup"
  | "stockStatus";

type FilterValue =
  | { type: "multi"; values: string[] }
  | { type: "text"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "range"; min?: number; max?: number }
  | { type: "number"; value: number | null };

interface SegmentFilterInstance {
  id: string;
  key: SegmentFilterKey;
  value: FilterValue;
}

interface SmartSegment {
  id: string;
  type: "smart";
  name: string;
  filters: SegmentFilterInstance[];
  createdAt: string;
  updatedAt: string;
}

interface StaticSegment {
  id: string;
  type: "static";
  name: string;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
  sourceFilters?: SegmentFilterInstance[];
}

type MarketingSegment = SmartSegment | StaticSegment;

interface FilterOption {
  value: string;
  label: string;
}

interface FilterConfig {
  key: SegmentFilterKey;
  label: string;
  description?: string;
  valueType: FilterValue["type"];
  placeholder?: string;
  options?: (customers: MarketingCustomer[]) => FilterOption[];
  evaluate: (customer: MarketingCustomer, instance: SegmentFilterInstance) => boolean;
  initialValue: () => FilterValue;
}

const FILTER_CONFIG: Record<SegmentFilterKey, FilterConfig> = {
  postalPrefix: {
    key: "postalPrefix",
    label: "PLZ / Region",
    description: "Mehrere PLZ mit Komma trennen, es wird auf Präfixe geprüft.",
    valueType: "text",
    placeholder: "z. B. 80, 81",
    evaluate: (customer, instance) => {
      const postalCode = customer.marketing.postalCode ?? "";
      const value = instance.value;
      if (value.type !== "text") return true;
      const parts = value.value
        .split(/[,\s]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (parts.length === 0) return true;
      return parts.some((prefix) => postalCode.startsWith(prefix));
    },
    initialValue: () => ({ type: "text", value: "" }),
  },
  region: {
    key: "region",
    label: "Region",
    valueType: "multi",
    options: () => REGION_SEGMENTS.map((segment) => ({ value: segment.id, label: segment.label })),
    evaluate: (customer, instance) => {
      if (instance.value.type !== "multi") return true;
      if (instance.value.values.length === 0) return true;
      return instance.value.values.includes(customer.marketing.regionId ?? "");
    },
    initialValue: () => ({ type: "multi", values: [] }),
  },
  salesRep: {
    key: "salesRep",
    label: "Zuständiger AD",
    valueType: "multi",
    options: (customers) => {
      const unique = new Map<string, string>();
      customers.forEach((customer) => {
        const repId = customer.salesRepresentative?.id ?? customer.salesRepresentativeEmail ?? customer.marketing.salesRepName ?? "";
        const repName = customer.marketing.salesRepName ?? customer.salesRepresentativeEmail ?? "Unzugeordnet";
        if (!repId) return;
        unique.set(repId, repName);
      });
      return Array.from(unique.entries()).map(([value, label]) => ({ value, label }));
    },
    evaluate: (customer, instance) => {
      if (instance.value.type !== "multi") return true;
      if (instance.value.values.length === 0) return true;
      const repId = customer.salesRepresentative?.id ?? customer.salesRepresentativeEmail ?? customer.marketing.salesRepName ?? "";
      return instance.value.values.includes(repId);
    },
    initialValue: () => ({ type: "multi", values: [] }),
  },
  customerType: {
    key: "customerType",
    label: "Kundengruppe",
    valueType: "multi",
    options: (customers) => {
      const unique = new Set<string>();
      customers.forEach((customer) => {
        unique.add(customer.marketing.customerType);
      });
      const preferredOrder = ["Gastro", "Fachhandel", "Endkunde"];
      const ordered = preferredOrder
        .filter((type) => unique.has(type))
        .map((type) => ({ value: type, label: type }));
      const others = Array.from(unique)
        .filter((type) => !preferredOrder.includes(type))
        .sort((a, b) => a.localeCompare(b))
        .map((type) => ({ value: type, label: type }));
      return [...ordered, ...others];
    },
    evaluate: (customer, instance) => {
      if (instance.value.type !== "multi") return true;
      if (instance.value.values.length === 0) return true;
      return instance.value.values.includes(customer.marketing.customerType);
    },
    initialValue: () => ({ type: "multi", values: [] }),
  },
  manufacturer: {
    key: "manufacturer",
    label: "Hersteller / Weingut",
    description: "Filtert nach Unternehmen oder Kundenname.",
    valueType: "text",
    placeholder: "z. B. Vinothek, Weingut"
      ,
    evaluate: (customer, instance) => {
      if (instance.value.type !== "text") return true;
      const term = normaliseText(instance.value.value);
      if (!term) return true;
      const company = normaliseText(customer.company);
      const name = normaliseText(customer.name);
      return company.includes(term) || name.includes(term);
    },
    initialValue: () => ({ type: "text", value: "" }),
  },
  grapeVariety: {
    key: "grapeVariety",
    label: "Rebsorte",
    valueType: "multi",
    options: () => GRAPE_VARIETIES.map((variety) => ({ value: variety, label: variety })),
    evaluate: (customer, instance) => {
      if (instance.value.type !== "multi") return true;
      if (instance.value.values.length === 0) return true;
      return instance.value.values.includes(customer.marketing.grapeVariety);
    },
    initialValue: () => ({ type: "multi", values: [] }),
  },
  focusWineTag: {
    key: "focusWineTag",
    label: "Fokuswein-Tag",
    valueType: "boolean",
    evaluate: (customer, instance) => {
      if (instance.value.type !== "boolean") return true;
      return customer.marketing.focusWineTag === instance.value.value;
    },
    initialValue: () => ({ type: "boolean", value: true }),
  },
  revenueRange: {
    key: "revenueRange",
    label: "Umsatz / DB Zeitraum",
    description: "Umsatz in Euro. Leer lassen für offene Grenzen.",
    valueType: "range",
    evaluate: (customer, instance) => {
      if (instance.value.type !== "range") return true;
      const revenue = customer.marketing.revenue ?? 0;
      const { min, max } = instance.value;
      if (min != null && revenue < min) return false;
      if (max != null && revenue > max) return false;
      return true;
    },
    initialValue: () => ({ type: "range" }),
  },
  orderCount: {
    key: "orderCount",
    label: "Bestellanzahl",
    description: "Grenzen für Anzahl an Käufen.",
    valueType: "range",
    evaluate: (customer, instance) => {
      if (instance.value.type !== "range") return true;
      const count = customer.orderCount ?? 0;
      const { min, max } = instance.value;
      if (min != null && count < min) return false;
      if (max != null && count > max) return false;
      return true;
    },
    initialValue: () => ({ type: "range" }),
  },
  lastInteraction: {
    key: "lastInteraction",
    label: "Inaktiv seit (Tage)",
    description: "Filtert Kunden, deren letzter Kontakt länger zurückliegt.",
    valueType: "number",
    evaluate: (customer, instance) => {
      if (instance.value.type !== "number") return true;
      if (instance.value.value == null || Number.isNaN(instance.value.value)) return true;
      const days = customer.marketing.daysSinceLastContact;
      if (days == null) return false;
      return days >= instance.value.value;
    },
    initialValue: () => ({ type: "number", value: 30 }),
  },
  paymentStatus: {
    key: "paymentStatus",
    label: "Zahlungsstatus",
    valueType: "multi",
    options: () => PAYMENT_STATES.map((status) => ({ value: status, label: status })),
    evaluate: (customer, instance) => {
      if (instance.value.type !== "multi") return true;
      if (instance.value.values.length === 0) return true;
      return instance.value.values.includes(customer.marketing.paymentStatus);
    },
    initialValue: () => ({ type: "multi", values: [] }),
  },
  optInStatus: {
    key: "optInStatus",
    label: "Opt-in Status",
    valueType: "multi",
    options: () => OPT_IN_STATES.map((status) => ({ value: status, label: status })),
    evaluate: (customer, instance) => {
      if (instance.value.type !== "multi") return true;
      if (instance.value.values.length === 0) return true;
      return instance.value.values.includes(customer.marketing.optInStatus);
    },
    initialValue: () => ({ type: "multi", values: [] }),
  },
  priceGroup: {
    key: "priceGroup",
    label: "Preisgruppe",
    valueType: "multi",
    options: (customers) => {
      const set = new Set<string>();
      customers.forEach((customer) => {
        if (customer.marketing.priceGroup) {
          set.add(customer.marketing.priceGroup);
        }
      });
      return Array.from(set).sort().map((value) => ({ value, label: value }));
    },
    evaluate: (customer, instance) => {
      if (instance.value.type !== "multi") return true;
      if (instance.value.values.length === 0) return true;
      const priceGroup = customer.marketing.priceGroup;
      if (!priceGroup) return false;
      return instance.value.values.includes(priceGroup);
    },
    initialValue: () => ({ type: "multi", values: [] }),
  },
  stockStatus: {
    key: "stockStatus",
    label: "Lagerbestand / Back-in-Stock",
    valueType: "multi",
    options: () => STOCK_STATES.map((status) => ({ value: status, label: status })),
    evaluate: (customer, instance) => {
      if (instance.value.type !== "multi") return true;
      if (instance.value.values.length === 0) return true;
      return instance.value.values.includes(customer.marketing.stockStatus);
    },
    initialValue: () => ({ type: "multi", values: [] }),
  },
};

const FILTER_KEYS: SegmentFilterKey[] = [
  "region",
  "postalPrefix",
  "salesRep",
  "customerType",
  "manufacturer",
  "grapeVariety",
  "focusWineTag",
  "revenueRange",
  "orderCount",
  "lastInteraction",
  "paymentStatus",
  "optInStatus",
  "priceGroup",
  "stockStatus",
];

const createInitialFilters = (): SegmentFilterInstance[] =>
  FILTER_KEYS.map((key) => ({ id: key, key, value: FILTER_CONFIG[key].initialValue() }));

const cloneFilter = (filter: SegmentFilterInstance): SegmentFilterInstance => ({
  id: filter.id,
  key: filter.key,
  value: JSON.parse(JSON.stringify(filter.value)) as FilterValue,
});

const isFilterDefault = (filter: SegmentFilterInstance) => {
  const initial = FILTER_CONFIG[filter.key].initialValue();
  return JSON.stringify(initial) === JSON.stringify(filter.value);
};

const deserializeSegments = (raw: unknown): MarketingSegment[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is MarketingSegment => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      ...entry,
      createdAt: (entry as any).createdAt ?? new Date().toISOString(),
      updatedAt: (entry as any).updatedAt ?? new Date().toISOString(),
    }));
};

const usePersistentSegments = (userId?: string | null) => {
  const storageKey = useMemo(() => `vinaturel.marketingSegments.${userId ?? "anonymous"}`, [userId]);
  const [segments, setSegments] = useState<MarketingSegment[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setSegments([]);
        return;
      }
      setSegments(deserializeSegments(JSON.parse(raw)));
    } catch (error) {
      console.warn("Fehler beim Laden der Segmente", error);
      setSegments([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(storageKey, JSON.stringify(segments));
  }, [segments, storageKey]);

  const addSegment = (segment: MarketingSegment) => {
    setSegments((prev) => [segment, ...prev]);
  };

  const updateSegment = (segment: MarketingSegment) => {
    setSegments((prev) => prev.map((entry) => (entry.id === segment.id ? segment : entry)));
  };

  const removeSegment = (segmentId: string) => {
    setSegments((prev) => prev.filter((entry) => entry.id !== segmentId));
  };

  return { segments, addSegment, updateSegment, removeSegment };
};

interface FilterRowProps {
  filter: SegmentFilterInstance;
  customers: MarketingCustomer[];
  onChange: (filter: SegmentFilterInstance) => void;
}

const MultiSelectChips = ({
  options,
  value,
  onToggle,
}: {
  options: FilterOption[];
  value: string[];
  onToggle: (option: string) => void;
}) => (
  <div className="flex flex-wrap gap-2">
    {options.map((option) => {
      const isActive = value.includes(option.value);
      return (
        <button
          key={option.value}
          type="button"
          onClick={() => onToggle(option.value)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
            isActive ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background text-foreground"
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

const RangeInputs = ({
  value,
  onChange,
}: {
  value: { min?: number; max?: number };
  onChange: (next: { min?: number; max?: number }) => void;
}) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
    <div className="flex flex-1 flex-col gap-1">
      <Label className="text-xs text-muted-foreground">Min</Label>
      <Input
        inputMode="numeric"
        value={value.min ?? ""}
        placeholder="z. B. 1000"
        onChange={(event) => {
          const parsed = Number.parseFloat(event.target.value);
          onChange({ ...value, min: Number.isNaN(parsed) ? undefined : parsed });
        }}
      />
    </div>
    <ArrowRight className="hidden h-4 w-4 opacity-60 sm:block" />
    <div className="flex flex-1 flex-col gap-1">
      <Label className="text-xs text-muted-foreground">Max</Label>
      <Input
        inputMode="numeric"
        value={value.max ?? ""}
        placeholder="z. B. 5000"
        onChange={(event) => {
          const parsed = Number.parseFloat(event.target.value);
          onChange({ ...value, max: Number.isNaN(parsed) ? undefined : parsed });
        }}
      />
    </div>
  </div>
);

const FilterRow = ({ filter, customers, onChange }: FilterRowProps) => {
  const config = FILTER_CONFIG[filter.key];
  const availableOptions = config.options?.(customers) ?? [];

  const handleValueChange = (value: FilterValue) => {
    onChange({ ...filter, value });
  };

  return (
    <Card className="border border-border/70 shadow-sm">
      <CardHeader className="flex flex-col gap-2 space-y-0 border-b border-border/60 pb-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base font-semibold">{config.label}</CardTitle>
          {config.description && (
            <CardDescription className="text-xs text-muted-foreground">{config.description}</CardDescription>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {config.valueType === "multi" && (
          <MultiSelectChips
            options={availableOptions}
            value={filter.value.type === "multi" ? filter.value.values : []}
            onToggle={(option) => {
              if (filter.value.type !== "multi") {
                handleValueChange({ type: "multi", values: [option] });
                return;
              }
              const current = filter.value.values;
              const next = current.includes(option)
                ? current.filter((entry) => entry !== option)
                : [...current, option];
              handleValueChange({ type: "multi", values: next });
            }}
          />
        )}

        {config.valueType === "text" && (
          <Input
            value={filter.value.type === "text" ? filter.value.value : ""}
            placeholder={config.placeholder}
            onChange={(event) => {
              handleValueChange({ type: "text", value: event.target.value });
            }}
          />
        )}

        {config.valueType === "boolean" && (
          <div className="flex items-center gap-3">
            <Switch
              checked={filter.value.type === "boolean" ? filter.value.value : true}
              onCheckedChange={(checked) => handleValueChange({ type: "boolean", value: Boolean(checked) })}
            />
            <span className="text-sm text-muted-foreground">
              {filter.value.type === "boolean" && !filter.value.value ? "Ohne Fokuswein-Tag" : "Mit Fokuswein-Tag"}
            </span>
          </div>
        )}

        {config.valueType === "range" && (
          <RangeInputs
            value={{
              min: filter.value.type === "range" ? filter.value.min : undefined,
              max: filter.value.type === "range" ? filter.value.max : undefined,
            }}
            onChange={(next) => handleValueChange({ type: "range", ...next })}
          />
        )}

        {config.valueType === "number" && (
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Tage seit letztem Kontakt</Label>
            <Input
              inputMode="numeric"
              value={filter.value.type === "number" && filter.value.value != null ? filter.value.value : ""}
              placeholder="z. B. 60"
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                handleValueChange({ type: "number", value: Number.isNaN(parsed) ? null : parsed });
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const SegmentPreviewTable = ({ customers }: { customers: MarketingCustomer[] }) => {
  if (customers.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4" />
        Keine Kunden für die aktuellen Filter gefunden.
      </div>
    );
  }

  const rows = customers.slice(0, 8);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kunde</TableHead>
            <TableHead>PLZ</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead>Preisgruppe</TableHead>
            <TableHead>Fokuswein</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((customer) => (
            <TableRow key={customer.id}>
              <TableCell className="font-medium">
                <div className="flex flex-col">
                  <span>{customer.name}</span>
                  {customer.company && <span className="text-xs text-muted-foreground">{customer.company}</span>}
                </div>
              </TableCell>
              <TableCell>{customer.marketing.postalCode ?? "–"}</TableCell>
              <TableCell>{customer.marketing.customerType}</TableCell>
              <TableCell>{customer.marketing.priceGroup ?? "–"}</TableCell>
              <TableCell>
                <Badge variant={customer.marketing.focusWineTag ? "default" : "outline"}>
                  {customer.marketing.focusWineTag ? "Ja" : "Nein"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

const formatFiltersForDisplay = (filters: SegmentFilterInstance[], customers: MarketingCustomer[]) => {
  return filters.map((filter) => {
    const config = FILTER_CONFIG[filter.key];
    if (filter.value.type === "multi") {
      const options = config.options?.(customers) ?? [];
      const labels = filter.value.values
        .map((value) => options.find((option) => option.value === value)?.label ?? value)
        .join(", ");
      return `${config.label}: ${labels || "Alle"}`;
    }
    if (filter.value.type === "boolean") {
      return `${config.label}: ${filter.value.value ? "Ja" : "Nein"}`;
    }
    if (filter.value.type === "range") {
      const min = filter.value.min != null ? filter.value.min.toLocaleString("de-DE") : "–";
      const max = filter.value.max != null ? filter.value.max.toLocaleString("de-DE") : "–";
      return `${config.label}: ${min} bis ${max}`;
    }
    if (filter.value.type === "number") {
      return `${config.label}: ${filter.value.value ?? "–"} Tage`;
    }
    if (filter.value.type === "text") {
      return `${config.label}: ${filter.value.value || "Alle"}`;
    }
    return config.label;
  });
};

const applyFilters = (customers: MarketingCustomer[], filters: SegmentFilterInstance[]) => {
  const activeFilters = filters.filter((filter) => !isFilterDefault(filter));
  if (activeFilters.length === 0) return customers;
  return customers.filter((customer) =>
    activeFilters.every((filter) => FILTER_CONFIG[filter.key].evaluate(customer, filter))
  );
};

const uniqueById = (customers: MarketingCustomer[]) => {
  const map = new Map<string, MarketingCustomer>();
  customers.forEach((customer) => {
    if (!map.has(customer.id)) {
      map.set(customer.id, customer);
    }
  });
  return Array.from(map.values());
};

const toCsv = (customers: MarketingCustomer[]) => {
  const headers = [
    "Kunden-ID",
    "Name",
    "Firma",
    "E-Mail",
    "PLZ",
    "Ort",
    "Kundentyp",
    "Preisgruppe",
    "Fokuswein",
    "Zuständiger AD",
  ];
  const rows = customers.map((customer) => [
    customer.id,
    customer.name,
    customer.company ?? "",
    customer.email,
    customer.marketing.postalCode ?? "",
    customer.city ?? "",
    customer.marketing.customerType,
    customer.marketing.priceGroup ?? "",
    customer.marketing.focusWineTag ? "Ja" : "Nein",
    customer.marketing.salesRepName ?? "",
  ]);
  return [headers, ...rows]
    .map((columns) => columns.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
};

const triggerDownload = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const MarketingSegmentsEmptyState = () => (
  <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border px-8 py-10 text-center">
    <ListPlus className="h-10 w-10 text-muted-foreground" />
    <div className="space-y-1">
      <p className="text-base font-semibold text-foreground">Noch keine Segmente gespeichert</p>
      <p className="text-sm text-muted-foreground">
        Lege oben eine Smart List oder eine Static List an und speichere sie für spätere Kampagnen.
      </p>
    </div>
  </div>
);

const SegmentCard = ({
  segment,
  customers,
  onDelete,
  onSnapshot,
}: {
  segment: MarketingSegment;
  customers: MarketingCustomer[];
  onDelete: (segmentId: string) => void;
  onSnapshot: (segment: SmartSegment) => void;
}) => {
  const enrichedCustomers = useMemo(() => {
    if (segment.type === "static") {
      const lookup = new Map(customers.map((customer) => [customer.id, customer] as const));
      return segment.memberIds.map((id) => lookup.get(id)).filter((entry): entry is MarketingCustomer => Boolean(entry));
    }
    return applyFilters(customers, segment.filters);
  }, [customers, segment]);

  const uniqueCustomers = uniqueById(enrichedCustomers);
  const duplicates = enrichedCustomers.length - uniqueCustomers.length;

  const filtersDescription = segment.type === "smart"
    ? formatFiltersForDisplay(segment.filters, customers)
    : formatFiltersForDisplay(segment.sourceFilters ?? [], customers);

  return (
    <Card className="border border-border/80">
      <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Badge variant={segment.type === "smart" ? "default" : "outline"} className="uppercase tracking-wide">
              {segment.type === "smart" ? "Smart List" : "Static List"}
            </Badge>
            <span className="text-muted-foreground">Aktualisiert am {new Date(segment.updatedAt).toLocaleDateString("de-DE")}</span>
          </div>
          <CardTitle className="text-xl">{segment.name}</CardTitle>
          {filtersDescription.length > 0 && (
            <CardDescription className="space-y-1 text-xs">
              {filtersDescription.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </CardDescription>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Badge variant="secondary">{uniqueCustomers.length} Kunden</Badge>
          {duplicates > 0 && (
            <Badge variant="destructive">{duplicates} Dubletten bereinigt</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <SegmentPreviewTable customers={uniqueCustomers} />
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerDownload(`${segment.name.replace(/\s+/g, "-")}.csv`, toCsv(uniqueCustomers))}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          {segment.type === "smart" && (
            <Button variant="secondary" size="sm" onClick={() => onSnapshot(segment)}>
              <Sparkles className="mr-2 h-4 w-4" /> Snapshot als Static
            </Button>
          )}
        </div>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(segment.id)}>
          <Trash2 className="mr-2 h-4 w-4" /> Entfernen
        </Button>
      </CardFooter>
    </Card>
  );
};

export function SegmentBuilder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: customers = [], isLoading, refetch, isFetching } = useQuery<MapCustomer[]>({
    queryKey: ["/admin-api/search/customer", "all"],
    queryFn: async () => fetchAllCustomers(500),
    staleTime: 1000 * 60 * 5,
  });

  const { data: salesReps = [] } = useQuery<SalesRepProfile[]>({
    queryKey: ["/admin-api/sales-reps"],
    queryFn: async () => {
      const response = await api.get<SalesRepProfile[]>("/admin-api/sales-reps");
      return response.data;
    },
    staleTime: 1000 * 60 * 10,
  });

  const salesRepLookup = useMemo(() => {
    const map = new Map<string, SalesRepProfile>();
    salesReps.forEach((rep) => {
      map.set(rep.id, rep);
      map.set(rep.email.toLowerCase(), rep);
    });
    return map;
  }, [salesReps]);

  const marketingCustomers = useMemo<MarketingCustomer[]>(() => {
    return customers.map((customer) => {
      const marketingProfile = deriveMarketingProfile(customer);
      const repCandidates = [
        customer.salesRepresentative?.id ?? null,
        customer.salesRepresentativeEmail?.toLowerCase() ?? null,
      ].filter((value): value is string => Boolean(value));

      const repProfile = repCandidates
        .map((identifier) => salesRepLookup.get(identifier))
        .find((profile) => Boolean(profile));

      const fallbackEmail = repProfile?.email ?? customer.salesRepresentativeEmail ?? null;

      const displayName = selectSalesRepName(
        [
          repProfile?.displayName,
          repProfile ? [repProfile.firstName, repProfile.lastName].filter(Boolean).join(" ") : null,
          customer.salesRepresentative?.name,
          fallbackNameFromEmail(repProfile?.email),
          fallbackNameFromEmail(customer.salesRepresentativeEmail),
        ],
        fallbackEmail
      );

      return {
        ...customer,
        marketing: {
          ...marketingProfile,
          salesRepName: displayName,
        },
      };
    });
  }, [customers, salesRepLookup]);

  const { segments, addSegment, removeSegment } = usePersistentSegments(user?.id ?? null);

  const [segmentType, setSegmentType] = useState<SegmentType>("smart");
  const [segmentName, setSegmentName] = useState("");
  const [filters, setFilters] = useState<SegmentFilterInstance[]>(() => createInitialFilters());
  const [openFilterKeys, setOpenFilterKeys] = useState<SegmentFilterKey[]>(["region"]);

  useEffect(() => {
    setSegmentName(segmentType === "smart" ? "Neue Smart List" : "Neue Static List");
  }, [segmentType]);

  const filteredCustomers = useMemo(() => applyFilters(marketingCustomers, filters), [marketingCustomers, filters]);
  const uniqueCustomers = useMemo(() => uniqueById(filteredCustomers), [filteredCustomers]);
  const duplicates = filteredCustomers.length - uniqueCustomers.length;

  const resetBuilder = () => {
    setFilters(createInitialFilters());
    setSegmentName(segmentType === "smart" ? "Neue Smart List" : "Neue Static List");
    setOpenFilterKeys(["region"]);
  };

  const handleFilterChange = (nextFilter: SegmentFilterInstance) => {
    setFilters((prev) => prev.map((filter) => (filter.key === nextFilter.key ? nextFilter : filter)));
  };

  const handleSaveSegment = () => {
    if (!segmentName.trim()) {
      toast({
        title: "Segment benötigt einen Namen",
        description: "Bitte vergebe einen eindeutigen Namen.",
        variant: "destructive",
      });
      return;
    }

    const activeFilters = filters.filter((filter) => !isFilterDefault(filter)).map(cloneFilter);

    if (segmentType === "smart") {
      const now = new Date().toISOString();
      addSegment({
        id: createId(),
        type: "smart",
        name: segmentName.trim(),
        filters: activeFilters,
        createdAt: now,
        updatedAt: now,
      });
      toast({
        title: "Smart List gespeichert",
        description: `${segmentName.trim()} aktualisiert sich automatisch anhand deiner Filter.`,
      });
      resetBuilder();
      return;
    }

    if (uniqueCustomers.length === 0) {
      toast({
        title: "Keine Kunden",
        description: "Static Lists benötigen mindestens einen Kunden.",
        variant: "destructive",
      });
      return;
    }

    const now = new Date().toISOString();
    addSegment({
      id: createId(),
      type: "static",
      name: segmentName.trim(),
      memberIds: uniqueCustomers.map((customer) => customer.id),
      createdAt: now,
      updatedAt: now,
      sourceFilters: activeFilters,
    });
    toast({
      title: "Static List erstellt",
      description: `${segmentName.trim()} enthält ${uniqueCustomers.length} eindeutige Kontakte.`,
    });
    resetBuilder();
  };

  const handleDeleteSegment = (segmentId: string) => {
    removeSegment(segmentId);
    toast({ title: "Segment entfernt" });
  };

  const handleSnapshot = (segment: SmartSegment) => {
    const now = new Date().toISOString();
    const customersForSegment = uniqueById(applyFilters(marketingCustomers, segment.filters));
    if (customersForSegment.length === 0) {
      toast({
        title: "Keine Kontakte",
        description: "Es gibt keine Treffer für diese Smart List.",
        variant: "destructive",
      });
      return;
    }
    addSegment({
      id: createId(),
      type: "static",
      name: `${segment.name} Snapshot`,
      memberIds: customersForSegment.map((customer) => customer.id),
      createdAt: now,
      updatedAt: now,
      sourceFilters: segment.filters,
    });
    toast({ title: "Snapshot erstellt", description: `Static List mit ${customersForSegment.length} Kunden gespeichert.` });
  };

  const filterSummaries = useMemo(() => {
    const summaryMap = new Map<SegmentFilterKey, string>();
    filters.forEach((filter) => {
      const summary = formatFiltersForDisplay([filter], marketingCustomers)[0];
      summaryMap.set(filter.key, summary ?? FILTER_CONFIG[filter.key].label);
    });
    return summaryMap;
  }, [filters, marketingCustomers]);

  const toggleFilterKey = (key: SegmentFilterKey) => {
    setOpenFilterKeys((prev) => (prev.includes(key) ? prev.filter((entry) => entry !== key) : [...prev, key]));
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-primary/40 shadow-sm">
        <CardHeader className="space-y-4 border-b border-border/50 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">Segment Builder</CardTitle>
              <CardDescription>
                Kombiniere Filterkriterien zu Smart Lists oder friere Treffer als Static List ein.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 rounded-full bg-muted/60 px-3 py-1 text-xs">
              <span className="font-medium text-muted-foreground">Resultate</span>
              <Badge variant="secondary" className="text-xs">{uniqueCustomers.length}</Badge>
              {duplicates > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {duplicates} Dubletten bereinigt
                </Badge>
              )}
            </div>
          </div>

          <Tabs value={segmentType} onValueChange={(value) => setSegmentType(value as SegmentType)} className="w-full">
            <TabsList className="w-full justify-start bg-muted/50">
              <TabsTrigger value="smart" className="data-[state=active]:bg-background">
                Smart List (regelbasiert)
              </TabsTrigger>
              <TabsTrigger value="static" className="data-[state=active]:bg-background">
                Static List (Snapshot)
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-col gap-2">
            <Label htmlFor="segment-name">Name</Label>
            <Input
              id="segment-name"
              value={segmentName}
              placeholder={segmentType === "smart" ? "z. B. Fokuskunden Süd" : "z. B. Messe München 2025"}
              onChange={(event) => setSegmentName(event.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => {
              const summary = filterSummaries.get(filter.key) ?? FILTER_CONFIG[filter.key].label;
              const isOpen = openFilterKeys.includes(filter.key);
              const configured = !isFilterDefault(filter);
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => toggleFilterKey(filter.key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    isOpen
                      ? "border-primary bg-primary/10 text-primary"
                      : configured
                        ? "border-primary/70 bg-primary/5 text-primary"
                        : "border-border/80 bg-background text-foreground"
                  )}
                >
                  {summary}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {filters
              .filter((filter) => openFilterKeys.includes(filter.key))
              .map((filter) => (
                <FilterRow
                  key={filter.key}
                  filter={filter}
                  customers={marketingCustomers}
                  onChange={handleFilterChange}
                />
              ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className="mr-2 h-4 w-4" /> Daten aktualisieren
            </Button>
          </div>

          <div className="space-y-3">
            <Label>Vorschau</Label>
            <SegmentPreviewTable customers={uniqueCustomers} />
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-4 border-t border-border/50 pt-6">
          <div className="flex flex-col text-xs text-muted-foreground">
            <span>Smart Lists bleiben live und aktualisieren sich automatisch.</span>
            <span>Static Lists speichern eine Momentaufnahme inklusive Deduplizierung.</span>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={resetBuilder}>Zurücksetzen</Button>
            <Button onClick={handleSaveSegment} disabled={isLoading}>
              <Save className="mr-2 h-4 w-4" /> Liste speichern
            </Button>
          </div>
        </CardFooter>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Gespeicherte Segmente</h3>
          <Badge variant="outline">{segments.length}</Badge>
        </div>
        {segments.length === 0 ? (
          <MarketingSegmentsEmptyState />
        ) : (
          <div className="grid gap-4">
            {segments.map((segment) => (
              <SegmentCard
                key={segment.id}
                segment={segment}
                customers={marketingCustomers}
                onDelete={handleDeleteSegment}
                onSnapshot={handleSnapshot}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default SegmentBuilder;
