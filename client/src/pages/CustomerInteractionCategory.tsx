import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Phone,
  PhoneCall,
  Clock,
  User,
  Building2,
  FileText,
  Paperclip as PaperclipIcon,
  ChevronRight,
  CheckCircle2,
  Circle,
} from "lucide-react";
import TopBar from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import type { MapCustomer } from "@shared/types/map-customer";
import { getInteractionCategory, type InteractionAction } from "@/data/interactionCategories";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type {
  FollowUpPriority,
  FollowUpReminder,
  CreateCustomerInteractionRequest,
  CustomerInteraction,
} from "@shared/types/interaction";

interface CustomerProfile extends MapCustomer {
  memberSince?: string | null;
  discountLevel?: string | null;
  totalRevenue?: string | null;
  orderCount?: number | null;
  lastContact?: string | null;
}

type CallStatus = "idle" | "dialing" | "in-call" | "ended";

const formatDuration = (totalSeconds: number) => {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "00:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [minutes, seconds].map((value) => value.toString().padStart(2, "0"));
  return hours > 0
    ? `${hours.toString().padStart(2, "0")}:${parts.join(":")}`
    : parts.join(":");
};

const parseDurationInput = (value: string) => {
  const sanitized = value.trim();
  if (!sanitized) return 0;
  const parts = sanitized.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) return 0;
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

const callStatusCopy: Record<CallStatus, { label: string; description: string; accent: string }> = {
  idle: {
    label: "Bereit",
    description: "Anruf kann gestartet werden",
    accent: "bg-muted text-muted-foreground",
  },
  dialing: {
    label: "Wird gewählt",
    description: "Verbindung wird aufgebaut",
    accent: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  },
  "in-call": {
    label: "Im Gespräch",
    description: "Läuft aktuell",
    accent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  },
  ended: {
    label: "Beendet",
    description: "Gespräch abgeschlossen",
    accent: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200",
  },
};

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role?: string;
}

interface PhoneInteractionFormProps {
  customer: CustomerProfile;
  customerId: string;
  onBack: () => void;
  onNavigateToCustomers: () => void;
  currentUserName?: string | null;
  currentUserId?: string | null;
  currentUserEmail?: string | null;
  teamMembers?: TeamMember[];
}

function PhoneInteractionForm({
  customer,
  customerId,
  onBack,
  onNavigateToCustomers,
  currentUserName,
  currentUserId,
  currentUserEmail,
  teamMembers,
}: PhoneInteractionFormProps) {
  const nowIso = useMemo(() => new Date().toISOString().slice(0, 16), []);
  const defaultDueDate = useMemo(() => {
    const due = new Date();
    due.setDate(due.getDate() + 7);
    return due.toISOString().slice(0, 10);
  }, []);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [scheduledAt, setScheduledAt] = useState(nowIso);
  const [responsibleEmployee, setResponsibleEmployee] = useState(currentUserName ?? "");

  const phoneNumbers = useMemo(() => {
    const numbers = new Set<string>();
    if (customer.phone) numbers.add(customer.phone);
    return Array.from(numbers);
  }, [customer.phone]);

  const [selectedNumber, setSelectedNumber] = useState(() => phoneNumbers[0] ?? "");
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [manualDuration, setManualDuration] = useState(formatDuration(0));
  const [callTimerId, setCallTimerId] = useState<ReturnType<typeof setInterval> | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [dialingTimeoutId, setDialingTimeoutId] = useState<number | null>(null);

  const [topic, setTopic] = useState("");
  const [result, setResult] = useState("");
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);

  const [createFollowUp, setCreateFollowUp] = useState(true);
  const [followUpTitle, setFollowUpTitle] = useState("Angebot per E-Mail senden");
  const [followUpDueDate, setFollowUpDueDate] = useState(defaultDueDate);
  const [followUpAssignee, setFollowUpAssignee] = useState<string | null>(() => currentUserId ?? null);
  const [followUpPriority, setFollowUpPriority] = useState<FollowUpPriority>("medium");
  const [followUpReminder, setFollowUpReminder] = useState<FollowUpReminder>("popup");

  const resolvedAssignees = useMemo(() => {
    const unique = new Map<string, TeamMember>();
    for (const member of teamMembers ?? []) {
      if (member?.id) {
        unique.set(member.id, {
          id: member.id,
          name: member.name ?? member.email ?? "Mitarbeiter",
          email: member.email,
          role: member.role,
        });
      }
    }
    if (currentUserId) {
      unique.set(currentUserId, {
        id: currentUserId,
        name: currentUserName ?? currentUserEmail ?? "Ich",
        email: currentUserEmail ?? "",
        role: undefined,
      });
    }
    return Array.from(unique.values());
  }, [teamMembers, currentUserEmail, currentUserId, currentUserName]);

  useEffect(() => {
    if (createFollowUp && !followUpTitle) {
      setFollowUpTitle("Angebot per E-Mail senden");
    }
  }, [createFollowUp, followUpTitle]);

  useEffect(() => {
    if (!followUpAssignee && resolvedAssignees.length > 0) {
      setFollowUpAssignee(resolvedAssignees[0].id);
    }
  }, [followUpAssignee, resolvedAssignees]);

  useEffect(() => {
    if (callStatus === "in-call" && callStartedAt === null) {
      const start = Date.now();
      setCallStartedAt(start);
      const intervalId = setInterval(() => {
        setCallDurationSeconds(Math.floor((Date.now() - start) / 1000));
      }, 1000);
      setCallTimerId(intervalId);
    }
  }, [callStatus, callStartedAt]);

  useEffect(() => {
    setManualDuration(formatDuration(callDurationSeconds));
  }, [callDurationSeconds]);

  useEffect(() => {
    return () => {
      if (callTimerId) {
        clearInterval(callTimerId);
      }
      if (dialingTimeoutId) {
        window.clearTimeout(dialingTimeoutId);
      }
    };
  }, [callTimerId, dialingTimeoutId]);

  const stopTimer = () => {
    if (callTimerId) {
      clearInterval(callTimerId);
      setCallTimerId(null);
    }
    setCallStartedAt(null);
  };

  const handleCallAction = () => {
    if (!selectedNumber) {
      setCallStatus("idle");
      return;
    }

    if (callStatus === "dialing") {
      if (dialingTimeoutId) {
        window.clearTimeout(dialingTimeoutId);
        setDialingTimeoutId(null);
      }
      setCallStatus("idle");
      return;
    }

    if (callStatus === "in-call") {
      stopTimer();
      setCallStatus("ended");
      return;
    }

    setCallStatus("dialing");
    setCallDurationSeconds(0);
    setManualDuration(formatDuration(0));
    const timeoutId = window.setTimeout(() => {
      setDialingTimeoutId(null);
      setCallStatus("in-call");
    }, 1200);
    setDialingTimeoutId(timeoutId);
  };

  const handleManualDurationChange = (value: string) => {
    setManualDuration(value);
    const seconds = parseDurationInput(value);
    if (Number.isFinite(seconds)) {
      setCallDurationSeconds(seconds);
    }
  };

  const handleAttachmentsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    setAttachments(files);
  };

  const companyLabel = customer.company ?? customer.name;
  const callCopy = callStatusCopy[callStatus];

  const createInteractionMutation = useMutation<
    CustomerInteraction,
    unknown,
    CreateCustomerInteractionRequest
  >({
    mutationFn: async (payload) => {
      const response = await api.post<{ interaction: CustomerInteraction }>(
        `/admin-api/customer/${customerId}/interactions`,
        payload
      );
      return response.data.interaction;
    },
    onSuccess: (interaction) => {
      queryClient.invalidateQueries({ queryKey: ["/admin-api/customer", customerId, "interactions"] });

      queryClient.setQueryData<MapCustomer | undefined>(
        ["/admin-api/customer", customerId],
        (existing) => (existing ? { ...existing, lastContact: interaction.occurredAt } : existing)
      );

      queryClient.setQueryData<MapCustomer[] | undefined>(
        ["/admin-api/search/customer"],
        (existing) =>
          existing
            ? existing.map((customer) =>
                customer.id === customerId
                  ? { ...customer, lastContact: interaction.occurredAt }
                  : customer
              )
            : existing
      );

      queryClient.invalidateQueries({ queryKey: ["/admin-api/search/customer"] });
      queryClient.invalidateQueries({ queryKey: ["/admin-api/tasks"] });

      toast({
        title: "Interaktion gespeichert",
        description: "Das Telefonat wurde in der Kundenakte protokolliert.",
      });
    },
    onError: (error: unknown) => {
      const fallbackMessage = 'Interaktion konnte nicht gespeichert werden.';
      if (error && typeof error === 'object' && 'response' in error) {
        const response = (error as { response?: { data?: { message?: string } } }).response;
        toast({
          title: 'Speichern fehlgeschlagen',
          description: response?.data?.message ?? fallbackMessage,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Speichern fehlgeschlagen', description: fallbackMessage, variant: 'destructive' });
      }
    },
  });

  const handleSave = async (mode: "close" | "next") => {
    if (dialingTimeoutId) {
      window.clearTimeout(dialingTimeoutId);
      setDialingTimeoutId(null);
    }

    stopTimer();
    setCallStatus("ended");

    const finalDurationSeconds = parseDurationInput(manualDuration);
    const normalizedDuration = Number.isFinite(finalDurationSeconds) ? finalDurationSeconds : callDurationSeconds;
    const finalStatus = callStatus === "in-call" || callStatus === "dialing" ? "ended" : callStatus;

    const occurredAtIso = (() => {
      if (!scheduledAt) return new Date().toISOString();
      const parsed = new Date(scheduledAt);
      return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
    })();

    const payload: CreateCustomerInteractionRequest = {
      type: "phone",
      occurredAt: occurredAtIso,
      employee: responsibleEmployee ? responsibleEmployee : null,
      durationSeconds: normalizedDuration > 0 ? normalizedDuration : undefined,
      topic: topic || null,
      result: result || null,
      notes: notes || null,
      attachmentsCount: attachments.length > 0 ? attachments.length : undefined,
      followUp: createFollowUp
        ? {
            title: followUpTitle,
            dueDate: followUpDueDate,
            assignee: followUpAssignee ? followUpAssignee : null,
            priority: followUpPriority,
            reminder: followUpReminder,
          }
        : null,
      metadata: {
        callStatus: finalStatus,
        phoneNumber: selectedNumber,
      },
    };

    try {
      await createInteractionMutation.mutateAsync(payload);
      if (mode === "next") {
        onNavigateToCustomers();
      } else {
        onBack();
      }
    } catch (error) {
      // Fehler-Toast wird im onError-Handler angezeigt
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <Button
        variant="ghost"
        className="w-fit gap-2 text-muted-foreground hover:text-foreground"
        onClick={onBack}
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Kundenakte
      </Button>

      <Card className="border-border bg-card">
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Phone className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
                  Telefonat mit {customer.name}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Dokumentiere das Gespräch und erstelle bei Bedarf eine Folgeaufgabe.
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="flex items-center gap-1 text-xs">
              <Circle className="h-3 w-3" />
              Live-Erfassung
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Unternehmen</p>
                <p className="text-sm font-medium text-foreground">{companyLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div className="w-full">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Datum &amp; Uhrzeit</p>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <div className="w-full">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Mitarbeiter</p>
                <Input
                  value={responsibleEmployee}
                  onChange={(event) => setResponsibleEmployee(event.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
              <PhoneCall className="h-5 w-5 text-muted-foreground" />
              <div className="w-full">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Telefonnummer</p>
                {phoneNumbers.length > 1 ? (
                  <Select value={selectedNumber} onValueChange={setSelectedNumber}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Nummer auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {phoneNumbers.map((number) => (
                        <SelectItem key={number} value={number}>
                          {number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={selectedNumber}
                    placeholder="Telefonnummer eingeben"
                    onChange={(event) => setSelectedNumber(event.target.value)}
                    className="mt-1"
                  />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Anruf starten</h2>
              <p className="text-sm text-muted-foreground">
                Bei angebundener Telefonanlage kannst du das Gespräch direkt aus dem CRM beginnen.
              </p>
            </div>
            <Badge className={callCopy.accent}>{callCopy.label}</Badge>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              size="lg"
              className="flex items-center gap-2"
              onClick={handleCallAction}
              disabled={!selectedNumber}
            >
              <PhoneCall className="h-5 w-5" />
              {callStatus === "in-call" ? "Gespräch beenden" : "Anruf starten"}
            </Button>
            <div className="flex flex-1 items-center justify-between rounded-lg border border-dashed border-border px-4 py-3 sm:ml-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Verbindungsstatus</p>
                <p className="text-sm font-medium text-foreground">{callCopy.description}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Dauer</p>
                <Input
                  value={manualDuration}
                  onChange={(event) => handleManualDurationChange(event.target.value)}
                  className="mt-1 w-28 text-right"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardContent className="space-y-6 p-6">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">Gesprächsnotiz</h2>
              <p className="text-sm text-muted-foreground">
                Halte Thema, Ergebnis und wichtige Details zum Gespräch fest.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="call-duration">Dauer (hh:mm:ss)</Label>
              <Input
                id="call-duration"
                value={manualDuration}
                onChange={(event) => handleManualDurationChange(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="call-topic">Thema</Label>
              <Input
                id="call-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Bestellung, Reklamation, Sortimentsanfrage..."
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="call-result">Ergebnis</Label>
              <Input
                id="call-result"
                value={result}
                onChange={(event) => setResult(event.target.value)}
                placeholder="Angebot angefragt, Kein Interesse..."
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="call-notes">Detail-Notizen</Label>
            <Textarea
              id="call-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={5}
              placeholder="Notizen zum Gespräch..."
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="call-attachments" className="flex items-center gap-2">
              <PaperclipIcon className="h-4 w-4" /> Dateianhänge
            </Label>
            <Input
              id="call-attachments"
              type="file"
              multiple
              onChange={handleAttachmentsChange}
              className="cursor-pointer"
            />
            {attachments.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {attachments.length} Datei(en) ausgewählt.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardContent className="space-y-6 p-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            <div className="flex flex-col">
              <h2 className="text-lg font-semibold text-foreground">Follow-up Aufgabe</h2>
              <p className="text-sm text-muted-foreground">
                Automatische Aufgabe für das Nachfassen erstellen.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="follow-up-enabled"
              checked={createFollowUp}
              onCheckedChange={(checked) => setCreateFollowUp(Boolean(checked))}
            />
            <Label htmlFor="follow-up-enabled" className="text-sm font-medium text-foreground">
              Folgeaufgabe erstellen
            </Label>
          </div>

          {createFollowUp && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="follow-up-title">Aufgabe</Label>
                <Input
                  id="follow-up-title"
                  value={followUpTitle}
                  onChange={(event) => setFollowUpTitle(event.target.value)}
                  placeholder="Angebot per E-Mail senden"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="follow-up-due">Fällig am</Label>
                <Input
                  id="follow-up-due"
                  type="date"
                  value={followUpDueDate}
                  onChange={(event) => setFollowUpDueDate(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Zuständig</Label>
                <Select
                  value={followUpAssignee ?? "unassigned"}
                  onValueChange={(value) => setFollowUpAssignee(value === "unassigned" ? null : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Mitarbeiter auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Nicht zugewiesen</SelectItem>
                    {resolvedAssignees.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Priorität</Label>
                <Select
                  value={followUpPriority}
                  onValueChange={(value) => setFollowUpPriority(value as FollowUpPriority)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Priorität wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">Hoch</SelectItem>
                    <SelectItem value="medium">Mittel</SelectItem>
                    <SelectItem value="low">Niedrig</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Erinnerung</Label>
                <Select
                  value={followUpReminder}
                  onValueChange={(value) => setFollowUpReminder(value as FollowUpReminder)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Erinnerung wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="popup">Popup im CRM</SelectItem>
                    <SelectItem value="email">E-Mail Erinnerung</SelectItem>
                    <SelectItem value="none">Keine Erinnerung</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="my-2" />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:gap-4">
        <Button
          variant="ghost"
          onClick={() => {
            if (!createInteractionMutation.isPending) {
              onBack();
            }
          }}
          className="sm:w-auto"
          disabled={createInteractionMutation.isPending}
        >
          Abbrechen
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <Button
            variant="outline"
            className="sm:w-auto"
            onClick={() => void handleSave("next")}
            disabled={createInteractionMutation.isPending}
          >
            Speichern &amp; Nächstes Telefonat
          </Button>
          <Button
            className="sm:w-auto"
            onClick={() => void handleSave("close")}
            disabled={createInteractionMutation.isPending}
          >
            Speichern &amp; Schließen
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CustomerInteractionCategory() {
  const { id: customerId, category: categoryId } = useParams<{
    id: string;
    category: string;
  }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const selectedCategory = useMemo(
    () => (categoryId ? getInteractionCategory(categoryId) : undefined),
    [categoryId]
  );

  const { data: teamData } = useQuery<{ users: TeamMember[] }>({
    queryKey: ["/admin-api/team"],
    queryFn: async () => {
      const response = await api.get("/admin-api/team");
      return response.data as { users: TeamMember[] };
    },
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });

  const { data: customer, isLoading: customerLoading } = useQuery<CustomerProfile>({
    queryKey: ["/admin-api/customer", customerId],
    queryFn: async () => {
      const response = await api.get(`/admin-api/customer/${customerId}`);
      return response.data as CustomerProfile;
    },
    enabled: Boolean(customerId),
  });

  const handleActionSelect = (action: InteractionAction) => {
    console.log("Interaktion auswählen", {
      customerId,
      categoryId: selectedCategory?.id,
      actionId: action.id,
    });
  };

  const handleBackToCustomer = () => {
    navigate(`/customer/${customerId}`);
  };

  if (customerLoading || !customer) {
    return (
      <>
        <TopBar title="Interaktion anlegen" showSearch={false} />
        <main className="flex-1 overflow-auto">
          <div className="flex h-full items-center justify-center p-6 text-muted-foreground">
            Daten werden geladen...
          </div>
        </main>
      </>
    );
  }

  if (!selectedCategory) {
    return (
      <>
        <TopBar
          title="Interaktion anlegen"
          showSearch={false}
          actions={
            <Button variant="outline" onClick={handleBackToCustomer}>
              Zur Kundenakte
            </Button>
          }
        />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-lg font-semibold text-foreground">
                  Der ausgewählte Interaktionskanal wurde nicht gefunden.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Bitte wähle einen der verfügbaren Kanäle aus der Kundenakte aus.
                </p>
                <Button className="mt-4" onClick={handleBackToCustomer}>
                  Zurück zur Kundenakte
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </>
    );
  }

  if (selectedCategory.id === "phone") {
    return (
      <>
        <TopBar
          title="Neue Interaktion – Telefonat"
          showSearch={false}
          actions={
            <Button variant="outline" onClick={handleBackToCustomer}>
              Zur Kundenakte
            </Button>
          }
        />
        <main className="flex-1 overflow-auto">
          <PhoneInteractionForm
            customer={customer}
            customerId={customerId ?? ""}
            onBack={handleBackToCustomer}
            onNavigateToCustomers={() => navigate("/customers")}
            currentUserName={user?.name ?? user?.email ?? null}
            currentUserId={user?.id ?? null}
            currentUserEmail={user?.email ?? null}
            teamMembers={teamData?.users}
          />
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar
        title="Interaktion anlegen"
        showSearch={false}
        actions={
          <Button variant="outline" onClick={handleBackToCustomer}>
            Zur Kundenakte
          </Button>
        }
      />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
          <Button
            variant="ghost"
            className="w-fit gap-2 text-muted-foreground hover:text-foreground"
            onClick={handleBackToCustomer}
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Kundenakte
          </Button>

          <Card className="border-border bg-card">
            <CardContent className="flex flex-col gap-4 p-6">
              <div className="flex flex-wrap items-center gap-4">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-md ${selectedCategory.accentClass}`}
                >
                  <selectedCategory.icon className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <h1 className="text-xl font-semibold text-foreground">
                    {selectedCategory.title}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {selectedCategory.description}
                  </p>
                </div>
                {customer && (
                  <Badge variant="secondary" className="text-xs">
                    {customer.name}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {selectedCategory.actions.map((action) => (
              <Button
                key={action.id}
                variant="ghost"
                className="group flex h-20 w-full items-center justify-between rounded-xl border border-border bg-card px-4 text-left transition-all hover:border-primary hover:bg-primary/5"
                onClick={() => handleActionSelect(action)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                    <action.icon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground sm:text-base">
                      {action.label}
                    </span>
                    <span className="text-xs text-muted-foreground sm:text-sm">
                      {action.description}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Button>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
