import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Phone,
  Mail,
  Edit,
  Euro,
  ShoppingCart,
  Calendar,
  ChevronRight,
  Heart,
  MapPin,
  Users as UsersIcon,
  FileText,
  Wine,
  Sparkles,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import TopBar from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import type { CustomerInteraction, CustomerInteractionsResponse, InteractionType } from "@shared/types/interaction";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

interface CustomerProfile extends MapCustomer {
  memberSince?: string | null;
  discountLevel?: string | null;
  totalRevenue?: string | null;
  orderCount?: number | null;
  lastContact?: string | null;
}

type MeetingTypeOption = "tasting" | "onsite" | "virtual";

type MeetingCatalogWine = {
  productId: string;
  articleNumber: string | null;
  winery: string | null;
  wineName: string | null;
  vintage: string | null;
  volume: string | null;
  remark?: string | null;
};

type MeetingCustomWine = {
  manufacturer: string;
  wineName: string;
  vintage: string | null;
  volume: string | null;
  remark?: string | null;
};

type MeetingMetadata = {
  meetingType?: string;
  durationMinutes?: number;
  location?: string;
  participants?: string[];
  agenda?: string;
  tastedWines?: {
    catalog?: MeetingCatalogWine[];
    custom?: MeetingCustomWine[];
  };
  tastedWineSummary?: string[];
  tastedWineText?: string;
};

const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  phone: "Telefonat",
  email: "E-Mail",
  meeting: "Termin / Verkostung",
  chat: "Chat / Nachricht",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const indicatesPurchase = (text?: string | null) => {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return /gekauft|bestellt|in die karte|aufgenommen|order|nachbestellt|verkauf/.test(normalized);
};

const extractMeetingMetadata = (interaction: CustomerInteraction): MeetingMetadata => {
  if (!isRecord(interaction.metadata)) {
    return {};
  }
  const raw = interaction.metadata as MeetingMetadata;
  return {
    meetingType: typeof raw.meetingType === 'string' ? raw.meetingType : undefined,
    durationMinutes:
      typeof raw.durationMinutes === 'number' && Number.isFinite(raw.durationMinutes)
        ? raw.durationMinutes
        : undefined,
    location: typeof raw.location === 'string' ? raw.location : undefined,
    participants: Array.isArray(raw.participants)
      ? raw.participants.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    agenda: typeof raw.agenda === 'string' ? raw.agenda : undefined,
    tastedWines: raw.tastedWines,
    tastedWineSummary: Array.isArray(raw.tastedWineSummary)
      ? raw.tastedWineSummary.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    tastedWineText: typeof raw.tastedWineText === 'string' ? raw.tastedWineText : undefined,
  };
};

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const customerId = id ?? "";
  const [location, navigate] = useLocation();
  const [newInteractionOpen, setNewInteractionOpen] = useState(false);
  const [selectedInteraction, setSelectedInteraction] = useState<CustomerInteraction | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [editResult, setEditResult] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editOccurredAt, setEditOccurredAt] = useState("");
  const [editEmployee, setEditEmployee] = useState("");
  const [editDuration, setEditDuration] = useState("00:00:00");
  const [editFollowUpEnabled, setEditFollowUpEnabled] = useState(false);
  const [editFollowUpTitle, setEditFollowUpTitle] = useState("");
  const [editFollowUpDueDate, setEditFollowUpDueDate] = useState("");
  const [editFollowUpAssignee, setEditFollowUpAssignee] = useState("");
  const [editMeetingType, setEditMeetingType] = useState<MeetingTypeOption>("tasting");
  const [editMeetingDurationMinutes, setEditMeetingDurationMinutes] = useState("");
  const [editMeetingLocation, setEditMeetingLocation] = useState("");
  const [editMeetingParticipants, setEditMeetingParticipants] = useState("");
  const [editMeetingAgenda, setEditMeetingAgenda] = useState("");
  const [editMeetingCatalogWines, setEditMeetingCatalogWines] = useState<MeetingCatalogWine[]>([]);
  const [editMeetingCustomWines, setEditMeetingCustomWines] = useState<MeetingCustomWine[]>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const selectedInteractionLabel = selectedInteraction
    ? INTERACTION_TYPE_LABELS[selectedInteraction.type]
    : null;

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

  const meetingInteractions = useMemo(
    () => interactions.filter((interaction) => interaction.type === 'meeting'),
    [interactions]
  );

  const meetingHistory = useMemo(() => {
    return [...meetingInteractions]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 5)
      .map((interaction) => {
        const metadata = extractMeetingMetadata(interaction);
        const catalogCount = metadata.tastedWines?.catalog?.length ?? 0;
        const customCount = metadata.tastedWines?.custom?.length ?? 0;
        const winesPresented = catalogCount + customCount;
        const purchasedFromRemarks = (metadata.tastedWines?.catalog ?? []).filter((wine) =>
          indicatesPurchase(wine.remark)
        ).length;
        const purchasedFromContext = indicatesPurchase(interaction.result) || indicatesPurchase(interaction.notes)
          ? winesPresented
          : purchasedFromRemarks;
        const status = winesPresented === 0
          ? 'Keine Weine dokumentiert'
          : purchasedFromContext > 0
            ? `${purchasedFromContext}/${winesPresented} gekauft`
            : 'Noch kein Kauf vermerkt';

        const agendaPreview = metadata.agenda?.split('\n').slice(0, 2).join(' · ');
        return {
          id: interaction.id,
          dateLabel: new Date(interaction.occurredAt).toLocaleDateString('de-DE', { dateStyle: 'medium' }),
          title: interaction.topic || metadata.agenda?.split('\n')[0] || 'Verkostung',
          winesPresented,
          status,
          notes: agendaPreview || interaction.result || interaction.notes || 'Keine Notizen hinterlegt.',
        };
      });
  }, [meetingInteractions]);

  const favoriteWineStats = useMemo(() => {
    const wineCount = new Map<string, { count: number; producer?: string | null }>();
    const producerCount = new Map<string, number>();

    meetingInteractions.forEach((interaction) => {
      const metadata = extractMeetingMetadata(interaction);
      const catalog = metadata.tastedWines?.catalog ?? [];
      const custom = metadata.tastedWines?.custom ?? [];

      catalog.forEach((wine) => {
        const key = wine.wineName ?? wine.productId ?? 'Unbekannter Wein';
        wineCount.set(key, {
          count: (wineCount.get(key)?.count ?? 0) + 1,
          producer: wine.winery ?? wine.articleNumber ?? null,
        });
        if (wine.winery) {
          producerCount.set(wine.winery, (producerCount.get(wine.winery) ?? 0) + 1);
        }
      });

      custom.forEach((wine) => {
        const key = `${wine.wineName} (${wine.manufacturer})`;
        wineCount.set(key, {
          count: (wineCount.get(key)?.count ?? 0) + 1,
          producer: wine.manufacturer,
        });
        if (wine.manufacturer) {
          producerCount.set(wine.manufacturer, (producerCount.get(wine.manufacturer) ?? 0) + 1);
        }
      });
    });

    const wines = Array.from(wineCount.entries())
      .map(([name, value]) => ({ name, count: value.count, producer: value.producer }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const producers = Array.from(producerCount.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return { wines, producers };
  }, [meetingInteractions]);

  const meetingConversion = useMemo(() => {
    let tasted = 0;
    let purchased = 0;

    meetingInteractions.forEach((interaction) => {
      const metadata = extractMeetingMetadata(interaction);
      const catalog = metadata.tastedWines?.catalog ?? [];
      const custom = metadata.tastedWines?.custom ?? [];
      const winesPresented = catalog.length + custom.length;
      tasted += winesPresented;

      const catalogPurchased = catalog.filter((wine) => indicatesPurchase(wine.remark)).length;
      const customPurchased = custom.filter((wine) => indicatesPurchase(wine.remark)).length;
      let interactionPurchased = catalogPurchased + customPurchased;

      if (interactionPurchased === 0 && (indicatesPurchase(interaction.result) || indicatesPurchase(interaction.notes))) {
        interactionPurchased = winesPresented;
      }

      purchased += interactionPurchased;
    });

    const rate = tasted > 0 ? Math.min(100, Math.round((purchased / Math.max(tasted, 1)) * 100)) : null;
    return { tasted, purchased, rate };
  }, [meetingInteractions]);

  const handleCategorySelect = (categoryId: string) => {
    setNewInteractionOpen(false);
    navigate(`/customer/${customerId}/interaction/${categoryId}`);
  };

  if (customerLoading || !customer) {
    return (
      <>
        <TopBar title="Kundenakte" showSearch={false} />
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

  const toDateTimeLocalValue = (isoString: string | null | undefined) => {
    if (!isoString) {
      return "";
    }
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const tzOffset = date.getTimezoneOffset();
    const localTime = new Date(date.getTime() - tzOffset * 60_000);
    return localTime.toISOString().slice(0, 16);
  };

  const fromDateTimeLocalValue = (value: string) => {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  };

  const formatSecondsForInput = (seconds: number | null | undefined) => {
    if (!Number.isFinite(seconds) || seconds == null || seconds < 0) {
      return "00:00:00";
    }
    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600)
      .toString()
      .padStart(2, "0");
    const minutes = Math.floor((totalSeconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const secs = (totalSeconds % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}:${secs}`;
  };

  const parseDurationToSeconds = (value: string) => {
    const sanitized = value.trim();
    if (!sanitized) {
      return 0;
    }
    const parts = sanitized.split(":").map((part) => Number.parseInt(part, 10));
    if (parts.some((part) => Number.isNaN(part) || part < 0)) {
      return 0;
    }
    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      return hours * 3600 + minutes * 60 + seconds;
    }
    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return minutes * 60 + seconds;
    }
    return parts[0];
  };

  const handleOpenInteraction = (interaction: CustomerInteraction) => {
    setSelectedInteraction(interaction);
    setEditTopic(interaction.topic ?? "");
    setEditResult(interaction.result ?? "");
    setEditNotes(interaction.notes ?? "");
    setEditOccurredAt(toDateTimeLocalValue(interaction.occurredAt));
    setEditEmployee(interaction.employee ?? "");
    setEditDuration(formatSecondsForInput(interaction.durationSeconds ?? null));
    setEditFollowUpEnabled(Boolean(interaction.followUp));
    setEditFollowUpTitle(interaction.followUp?.title ?? "");
    const followUpDue = interaction.followUp?.dueDate ?? "";
    setEditFollowUpDueDate(followUpDue.includes("T") ? followUpDue.slice(0, 10) : followUpDue);
    setEditFollowUpAssignee(interaction.followUp?.assignee ?? "");

    if (interaction.type === "meeting") {
      const metadata = interaction.metadata ?? {};
      const meetingTypeValue = typeof metadata.meetingType === "string" ? metadata.meetingType : null;
      if (meetingTypeValue === "onsite" || meetingTypeValue === "virtual" || meetingTypeValue === "tasting") {
        setEditMeetingType(meetingTypeValue);
      } else {
        setEditMeetingType("tasting");
      }

      const metadataDuration = typeof metadata.durationMinutes === "number" ? metadata.durationMinutes : null;
      const derivedDurationMinutes = metadataDuration != null
        ? metadataDuration.toString()
        : interaction.durationSeconds != null
            ? Math.round(interaction.durationSeconds / 60).toString()
            : "";
      setEditMeetingDurationMinutes(derivedDurationMinutes);

      setEditMeetingLocation(typeof metadata.location === "string" ? metadata.location : "");

      const metadataParticipants = Array.isArray((metadata as { participants?: unknown }).participants)
        ? ((metadata as { participants?: string[] }).participants ?? [])
        : [];
      setEditMeetingParticipants(metadataParticipants.join("\n"));

      setEditMeetingAgenda(typeof metadata.agenda === "string" ? metadata.agenda : "");

      const tastedWines = (metadata as { tastedWines?: { catalog?: MeetingCatalogWine[]; custom?: MeetingCustomWine[] } }).tastedWines;
      setEditMeetingCatalogWines(Array.isArray(tastedWines?.catalog) ? tastedWines.catalog : []);
      setEditMeetingCustomWines(Array.isArray(tastedWines?.custom) ? tastedWines.custom : []);
    } else {
      setEditMeetingType("tasting");
      setEditMeetingDurationMinutes("");
      setEditMeetingLocation("");
      setEditMeetingParticipants("");
      setEditMeetingAgenda("");
      setEditMeetingCatalogWines([]);
      setEditMeetingCustomWines([]);
    }
  };

  const handleCloseInteraction = () => {
    setSelectedInteraction(null);
    setEditTopic("");
    setEditResult("");
    setEditNotes("");
    setEditOccurredAt("");
    setEditEmployee("");
    setEditDuration("00:00:00");
    setEditFollowUpEnabled(false);
    setEditFollowUpTitle("");
    setEditFollowUpDueDate("");
    setEditFollowUpAssignee("");
    setEditMeetingType("tasting");
    setEditMeetingDurationMinutes("");
    setEditMeetingLocation("");
    setEditMeetingParticipants("");
    setEditMeetingAgenda("");
    setEditMeetingCatalogWines([]);
    setEditMeetingCustomWines([]);
  };

  const handleSaveInteraction = () => {
    if (!selectedInteraction) {
      return;
    }
    const updatedOccurredAt = fromDateTimeLocalValue(editOccurredAt) ?? selectedInteraction.occurredAt;
    const normalizedDurationSeconds = parseDurationToSeconds(editDuration);
    const followUpDueDateValue = editFollowUpDueDate || selectedInteraction.followUp?.dueDate || new Date().toISOString().slice(0, 10);
    let metadata: Record<string, unknown> | null = (selectedInteraction.metadata as Record<string, unknown> | null) ?? null;

    if (selectedInteraction.type === "meeting") {
      const metadataEntries: Record<string, unknown> = {};

      if (editMeetingType) {
        metadataEntries.meetingType = editMeetingType;
      }

      const parsedDurationMinutes = Number.parseInt(editMeetingDurationMinutes, 10);
      if (Number.isFinite(parsedDurationMinutes) && parsedDurationMinutes > 0) {
        metadataEntries.durationMinutes = parsedDurationMinutes;
      }

      if (editMeetingLocation.trim()) {
        metadataEntries.location = editMeetingLocation.trim();
      }

      const participantList = editMeetingParticipants
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (participantList.length > 0) {
        metadataEntries.participants = participantList;
      }

      if (editMeetingAgenda.trim()) {
        metadataEntries.agenda = editMeetingAgenda.trim();
      }

      if (editMeetingCatalogWines.length > 0 || editMeetingCustomWines.length > 0) {
        metadataEntries.tastedWines = {
          catalog: editMeetingCatalogWines,
          custom: editMeetingCustomWines,
        };

        const tastingSummary = [
          ...editMeetingCatalogWines.map((entry) => {
            const parts = [entry.winery, entry.wineName, entry.vintage].filter(Boolean);
            const base = parts.join(" – ");
            return entry.remark ? `${base} (${entry.remark})` : base;
          }),
          ...editMeetingCustomWines.map((entry) => {
            const parts = [entry.manufacturer, entry.wineName, entry.vintage].filter(Boolean);
            const base = parts.join(" – ");
            return entry.remark ? `${base} (${entry.remark})` : base;
          }),
        ].filter(Boolean);

        if (tastingSummary.length > 0) {
          metadataEntries.tastedWineSummary = tastingSummary;
          metadataEntries.tastedWineText = tastingSummary.join("\n");
        }
      }

      metadata = Object.keys(metadataEntries).length > 0 ? metadataEntries : null;
    }

    const updatedInteraction: CustomerInteraction = {
      ...selectedInteraction,
      topic: editTopic.trim() ? editTopic.trim() : null,
      result: editResult.trim() ? editResult.trim() : null,
      notes: editNotes.trim() ? editNotes.trim() : null,
      occurredAt: updatedOccurredAt,
      employee: editEmployee.trim() ? editEmployee.trim() : null,
      durationSeconds: normalizedDurationSeconds,
      followUp: editFollowUpEnabled
        ? {
            title: editFollowUpTitle.trim() ? editFollowUpTitle.trim() : "Follow-up",
            dueDate: followUpDueDateValue,
            assignee: editFollowUpAssignee.trim() ? editFollowUpAssignee.trim() : null,
            priority: selectedInteraction.followUp?.priority ?? "medium",
            reminder: selectedInteraction.followUp?.reminder ?? "popup",
          }
        : null,
      metadata,
      updatedAt: new Date().toISOString(),
    };

    queryClient.setQueryData<CustomerInteraction[]>(
      ["/admin-api/customer", customerId, "interactions"],
      (current) => {
        if (!current) {
          return current;
        }
        return current.map((entry) => (entry.id === updatedInteraction.id ? updatedInteraction : entry));
      }
    );

    toast({
      title: "Interaktion aktualisiert",
      description: `${formatInteractionTitle(updatedInteraction)} wurde angepasst.`,
    });

    handleCloseInteraction();
  };

  return (
    <>
      <TopBar title="Kundenakte" showSearch={false} />
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
                            <button
                              key={interaction.id}
                              type="button"
                              onClick={() => handleOpenInteraction(interaction)}
                              className="flex w-full items-start gap-4 rounded-lg border border-transparent bg-muted p-4 text-left transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                            >
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
                            </button>
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

                  {/* Verkostungshistorie */}
                  <Card className="bg-card">
                    <CardContent className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Verkostungshistorie</h4>
                          <p className="text-xs text-muted-foreground">
                            Zuletzt dokumentierte Termine mit probierten Weinen und Feedback.
                          </p>
                        </div>
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      {meetingHistory.length > 0 ? (
                        <div className="space-y-3">
                          {meetingHistory.map((entry) => (
                            <div key={entry.id} className="rounded-md border border-border/50 bg-muted/40 px-3 py-2">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{entry.dateLabel}</span>
                                <span>{entry.status}</span>
                              </div>
                              <p className="mt-1 text-sm font-medium text-foreground line-clamp-1">{entry.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                {entry.notes}
                              </p>
                              <p className="mt-2 text-xs text-muted-foreground">
                                Präsentiert: {entry.winesPresented}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Noch keine Verkostungen protokolliert.</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Hitliste der Kundenfavoriten */}
                  <Card className="bg-card">
                    <CardContent className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Hitliste der Kundenfavoriten</h4>
                          <p className="text-xs text-muted-foreground">
                            Welche Weine haben nach Verkostungen die Nase vorn?
                          </p>
                        </div>
                        <Trophy className="h-4 w-4 text-accent" />
                      </div>
                      {favoriteWineStats.wines.length > 0 ? (
                        <div className="space-y-3 text-sm">
                          {favoriteWineStats.wines.slice(0, 3).map((wine) => (
                            <div key={wine.name} className="rounded-md border border-border/40 bg-muted/30 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-foreground line-clamp-1">{wine.name}</span>
                                <span className="text-xs text-muted-foreground">{wine.count}×</span>
                              </div>
                              {wine.producer && (
                                <p className="mt-1 text-xs text-muted-foreground">{wine.producer}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Noch keine Favoriten ermittelt.</p>
                      )}
                      {favoriteWineStats.producers.length > 0 && (
                        <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
                          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Beliebte Produzenten</p>
                          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                            {favoriteWineStats.producers.map((producer) => (
                              <li key={producer.name} className="flex justify-between">
                                <span className="line-clamp-1">{producer.name}</span>
                                <span>{producer.count}×</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Erfolgsquote */}
                  <Card className="bg-card">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Erfolgsquote Verkostung → Kauf</h4>
                          <p className="text-xs text-muted-foreground">
                            Anteil der verkosteten Weine, die innerhalb kurzer Zeit bestellt wurden.
                          </p>
                        </div>
                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-3 text-center">
                        {meetingConversion.rate != null ? (
                          <>
                            <p className="text-3xl font-semibold text-foreground">{meetingConversion.rate}%</p>
                            <p className="text-xs text-muted-foreground">
                              {meetingConversion.purchased} von {meetingConversion.tasted} präsentierten Weinen
                              als gekauft markiert.
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Noch keine Daten zur Erfolgsquote vorhanden.
                          </p>
                        )}
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
      <Dialog open={Boolean(selectedInteraction)} onOpenChange={(open) => !open && handleCloseInteraction()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Interaktion bearbeiten</DialogTitle>
            <DialogDescription>
              Passe Dauer, Inhalte und Follow-up an. Änderungen werden aktuell nur lokal im Verlauf aktualisiert.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-6">
            {selectedInteraction?.type === "meeting" ? (
              <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Interaktion</Label>
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">
                    {selectedInteractionLabel}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interaction-occurred-at">Zeitpunkt</Label>
                  <Input
                    id="interaction-occurred-at"
                    type="datetime-local"
                    value={editOccurredAt}
                    onChange={(event) => setEditOccurredAt(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interaction-employee">Mitarbeiter*in</Label>
                  <Input
                    id="interaction-employee"
                    value={editEmployee}
                    placeholder="z. B. Christina Melsheimer"
                    onChange={(event) => setEditEmployee(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interaction-duration">Dauer (hh:mm:ss)</Label>
                  <Input
                    id="interaction-duration"
                    value={editDuration}
                    onChange={(event) => setEditDuration(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Terminart</Label>
                    <Select value={editMeetingType} onValueChange={(value) => setEditMeetingType(value as MeetingTypeOption)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Terminart wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tasting">Verkostung</SelectItem>
                        <SelectItem value="onsite">Vor-Ort Termin</SelectItem>
                        <SelectItem value="virtual">Online Meeting</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meeting-duration-minutes">Dauer (Minuten)</Label>
                    <Input
                      id="meeting-duration-minutes"
                      value={editMeetingDurationMinutes}
                      onChange={(event) => setEditMeetingDurationMinutes(event.target.value)}
                      placeholder="60"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meeting-location" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" /> Ort / Meeting-Link
                    </Label>
                    <Input
                      id="meeting-location"
                      value={editMeetingLocation}
                      onChange={(event) => setEditMeetingLocation(event.target.value)}
                      placeholder="Vinaturel Showroom, Musterstraße 1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meeting-participants" className="flex items-center gap-2">
                    <UsersIcon className="h-4 w-4" /> Teilnehmerliste
                  </Label>
                  <Textarea
                    id="meeting-participants"
                    rows={4}
                    value={editMeetingParticipants}
                    onChange={(event) => setEditMeetingParticipants(event.target.value)}
                    placeholder={`z. B. ${selectedInteraction.employee ?? "Verantwortliche Person"}`}
                  />
                  <p className="text-xs text-muted-foreground">Ein Teilnehmer pro Zeile.</p>
                </div>
                <Separator />
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="interaction-topic" className="flex items-center gap-2">
                      <FileText className="h-4 w-4" /> Titel / Thema
                    </Label>
                    <Input
                      id="interaction-topic"
                      value={editTopic}
                      placeholder="z. B. Portfolioverkostung Q3"
                      onChange={(event) => setEditTopic(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meeting-agenda">Agenda</Label>
                    <Textarea
                      id="meeting-agenda"
                      rows={4}
                      value={editMeetingAgenda}
                      onChange={(event) => setEditMeetingAgenda(event.target.value)}
                      placeholder="1. Begrüßung\n2. Vorstellung neuer Weine..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="interaction-result">Ergebnis</Label>
                    <Input
                      id="interaction-result"
                      value={editResult}
                      placeholder="z. B. Kunde nimmt 3 Kisten in die Karte auf"
                      onChange={(event) => setEditResult(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="interaction-notes">Detail-Notizen</Label>
                    <Textarea
                      id="interaction-notes"
                      rows={4}
                      value={editNotes}
                      placeholder="Besonderheiten, Rückfragen oder Anmerkungen erfassen"
                      onChange={(event) => setEditNotes(event.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-lg border border-border bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Wine className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">Verkostete Weine</p>
                </div>
                {editMeetingCatalogWines.length === 0 && editMeetingCustomWines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Weine hinterlegt.</p>
                ) : (
                  <div className="space-y-3 text-sm">
                    {editMeetingCatalogWines.length > 0 && (
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">Aus dem Sortiment</p>
                        <ul className="space-y-1">
                          {editMeetingCatalogWines.map((wine, index) => (
                            <li key={`${wine.productId}-${index}`} className="rounded border border-border/60 bg-background/70 px-3 py-2">
                              <p className="font-medium text-foreground">{wine.wineName ?? "Wein"}</p>
                              <p className="text-xs text-muted-foreground">
                                {[wine.articleNumber, wine.winery, wine.vintage, wine.volume].filter(Boolean).join(" • ")}
                              </p>
                              {wine.remark && <p className="mt-1 text-xs text-muted-foreground">{wine.remark}</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {editMeetingCustomWines.length > 0 && (
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">Eigene Einträge</p>
                        <ul className="space-y-1">
                          {editMeetingCustomWines.map((wine, index) => (
                            <li key={`${wine.manufacturer}-${wine.wineName}-${index}`} className="rounded border border-border/60 bg-background/70 px-3 py-2">
                              <p className="font-medium text-foreground">{wine.wineName}</p>
                              <p className="text-xs text-muted-foreground">
                                {[wine.manufacturer, wine.vintage, wine.volume].filter(Boolean).join(" • ")}
                              </p>
                              {wine.remark && <p className="mt-1 text-xs text-muted-foreground">{wine.remark}</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="interaction-occurred-at">Zeitpunkt</Label>
                  <Input
                    id="interaction-occurred-at"
                    type="datetime-local"
                    value={editOccurredAt}
                    onChange={(event) => setEditOccurredAt(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interaction-employee">Mitarbeiter*in</Label>
                  <Input
                    id="interaction-employee"
                    value={editEmployee}
                    onChange={(event) => setEditEmployee(event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="interaction-duration">Dauer (hh:mm:ss)</Label>
                <Input
                  id="interaction-duration"
                  value={editDuration}
                  onChange={(event) => setEditDuration(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="interaction-topic">Thema</Label>
                <Input
                  id="interaction-topic"
                  value={editTopic}
                  placeholder="z. B. Verkostung beim Kunden"
                  onChange={(event) => setEditTopic(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="interaction-result">Ergebnis</Label>
                <Input
                  id="interaction-result"
                  value={editResult}
                  placeholder="z. B. Angebot folgt per E-Mail"
                  onChange={(event) => setEditResult(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="interaction-notes">Notizen</Label>
                <Textarea
                  id="interaction-notes"
                  rows={4}
                  value={editNotes}
                  placeholder="Interne Hinweise oder Gesprächsnotizen"
                  onChange={(event) => setEditNotes(event.target.value)}
                />
              </div>
            </div>
          )}

            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="interaction-followup-enabled"
                  checked={editFollowUpEnabled}
                  onCheckedChange={(checked) => setEditFollowUpEnabled(Boolean(checked))}
                />
                <Label htmlFor="interaction-followup-enabled" className="text-sm font-medium text-foreground">
                  Follow-up Aufgabe
                </Label>
              </div>
              {editFollowUpEnabled && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="interaction-followup-title">Aufgabe</Label>
                    <Input
                      id="interaction-followup-title"
                      value={editFollowUpTitle}
                      onChange={(event) => setEditFollowUpTitle(event.target.value)}
                      placeholder="Nachfassen, Angebot senden..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="interaction-followup-due">Fällig am</Label>
                    <Input
                      id="interaction-followup-due"
                      type="date"
                      value={editFollowUpDueDate}
                      onChange={(event) => setEditFollowUpDueDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="interaction-followup-assignee">Verantwortlich</Label>
                    <Input
                      id="interaction-followup-assignee"
                      value={editFollowUpAssignee}
                      onChange={(event) => setEditFollowUpAssignee(event.target.value)}
                      placeholder="wer übernimmt?"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {selectedInteraction?.attachmentsCount && selectedInteraction.attachmentsCount > 0 ? (
                <span>
                  {selectedInteraction.attachmentsCount} Anhang/Anhänge verknüpft (Datei-Upload aktuell nicht bearbeitbar).
                </span>
              ) : (
                <span>Keine Dateien hinterlegt.</span>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCloseInteraction}>
              Abbrechen
            </Button>
            <Button onClick={handleSaveInteraction}>
              Speichern
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
