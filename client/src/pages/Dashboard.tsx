import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Loader2, ShoppingCart, ArrowRight, Euro, Users, TrendingUp, CalendarDays, RefreshCw, ExternalLink, Plug, Unlink, CheckSquare } from "lucide-react";
import { Link, useLocation } from "wouter";

import TopBar from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import type { DashboardData, DashboardOrderSummary } from "@shared/types/dashboard";
import type { Task, TaskListResponse, TaskPriority, TaskStatus } from "@shared/types/task";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

function formatCurrency(value: number | null | undefined, currency?: string | null) {
  if (value === null || value === undefined) {
    return '–';
  }

  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: 2
    }).format(value);
  } catch (error) {
    return `${value.toFixed(2)} ${currency ?? 'EUR'}`;
  }
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

type CalendarDateTime = {
  dateTime: string;
  timeZone: string;
};

type CalendarEvent = {
  id: string;
  subject: string | null;
  start: CalendarDateTime | null;
  end: CalendarDateTime | null;
  location: string | null;
  isOnlineMeeting: boolean;
  onlineMeetingUrl: string | null;
  organizer: string | null;
};

type CalendarResponse = {
  success: boolean;
  configured: boolean;
  connected: boolean;
  events: CalendarEvent[];
  message?: string;
};

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'Offen',
  in_progress: 'In Bearbeitung',
  waiting: 'Wartet',
  completed: 'Erledigt'
};

const TASK_STATUS_CLASS: Record<TaskStatus, string> = {
  open: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
  in_progress: 'bg-blue-200 text-blue-900 dark:bg-blue-500/20 dark:text-blue-100',
  waiting: 'bg-amber-200 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
  completed: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100'
};

const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig'
};

const TASK_PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500'
};

function formatCalendarDate(date: CalendarDateTime | null) {
  if (!date?.dateTime) {
    return '–';
  }

  const parsed = new Date(date.dateTime);
  if (Number.isNaN(parsed.getTime())) {
    return '–';
  }

  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: date.timeZone ?? undefined
  }).format(parsed);
}

function formatCalendarRange(event: CalendarEvent) {
  if (!event.start && !event.end) {
    return '–';
  }

  const startLabel = formatCalendarDate(event.start);
  const endLabel = formatCalendarDate(event.end);

  if (startLabel === '–') {
    return endLabel;
  }
  if (endLabel === '–') {
    return startLabel;
  }

  return `${startLabel} – ${endLabel}`;
}

export default function Dashboard() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [isStartingOAuth, setIsStartingOAuth] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const { user } = useAuth();

  const { data, isLoading, isError, error, refetch } = useQuery<DashboardData>({
    queryKey: ['/admin-api/dashboard/orders'],
    queryFn: async () => {
      const response = await api.get('/admin-api/dashboard/orders?limit=12');
      return response.data as DashboardData;
    },
    staleTime: 1000 * 30
  });

  const {
    data: calendarData,
    isLoading: calendarLoading,
    isFetching: calendarFetching,
    isError: calendarIsError,
    error: calendarError,
    refetch: refetchCalendar
  } = useQuery<CalendarResponse>({
    queryKey: ['/api/calendar/events'],
    queryFn: async () => {
      const response = await api.get('/api/calendar/events');
      return response.data as CalendarResponse;
    },
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false
  });

  const calendarEvents = calendarData?.events ?? [];
  const isCalendarConfigured = calendarData?.configured ?? false;
  const isCalendarConnected = calendarData?.connected ?? false;
  const calendarErrorMessage = calendarError instanceof Error ? calendarError.message : 'Kalender konnte nicht geladen werden.';
  const calendarStatusLabel = !isCalendarConfigured
    ? 'Nicht konfiguriert'
    : isCalendarConnected
    ? 'Verbunden'
    : 'Nicht verbunden';
  const calendarStatusVariant = !isCalendarConfigured
    ? 'destructive'
    : isCalendarConnected
    ? 'secondary'
    : 'outline';

  const {
    data: tasksData,
    isLoading: tasksLoading,
    isFetching: tasksFetching,
    isError: tasksIsError,
    error: tasksError,
    refetch: refetchTasks
  } = useQuery<TaskListResponse>({
    queryKey: ['/admin-api/tasks', { scope: 'dashboard', userId: user?.id ?? null }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('status', 'open,in_progress,waiting');
      if (user?.id) {
        params.set('assignee', user.id);
      }
      const response = await api.get('/admin-api/tasks', { params });
      return response.data as TaskListResponse;
    },
    enabled: Boolean(user?.id),
    staleTime: 1000 * 30
  });

  const orders = data?.orders ?? [];
  const stats = data?.stats;

  const hasOrders = orders.length > 0;

  const tasks = (tasksData?.tasks ?? []).slice(0, 5);
  const tasksSummary = tasksData?.summary;
  const tasksLoadingState = tasksLoading || tasksFetching;

  const metrics = useMemo(() => {
    const totalRevenue = stats ? formatCurrency(stats.totalRevenue ?? 0, 'EUR') : '–';
    const totalOrders = stats ? stats.totalOrders.toLocaleString('de-DE') : '–';
    const customerCount = stats ? stats.customerCount.toLocaleString('de-DE') : '–';
    const averageOrderValue = stats ? formatCurrency(stats.averageOrderValue ?? 0, 'EUR') : '–';
    const latestOrderDate = stats ? formatDate(stats.latestOrderDate) : '–';

    return [
      {
        label: 'Gesamtumsatz',
        value: totalRevenue,
        description: 'Summe aller Bestellungen deiner Kunden',
        icon: Euro
      },
      {
        label: 'Bestellungen',
        value: totalOrders,
        description: latestOrderDate ? `Letzte Bestellung: ${latestOrderDate}` : 'Noch keine Bestellungen',
        icon: ShoppingCart
      },
      {
        label: 'Anzahl Kunden',
        value: customerCount,
        description: 'Zugewiesene Kunden mit aktiven Daten',
        icon: Users
      },
      {
        label: 'Ø Bestellwert',
        value: averageOrderValue,
        description: 'Durchschnittlicher Umsatz pro Bestellung',
        icon: TrendingUp
      }
    ];
  }, [stats]);

  const sectionContent = useMemo(() => {
    if (isLoading) {
      return (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Lade aktuelle Bestellungen…
        </div>
      );
    }

    if (isError) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-red-600">
          <p>Die Bestellungen konnten nicht geladen werden.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-primary underline"
          >
            Erneut versuchen
          </button>
          {error instanceof Error && (
            <span className="text-xs text-muted-foreground">{error.message}</span>
          )}
        </div>
      );
    }

    if (!hasOrders) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
          <ShoppingCart className="h-10 w-10" />
          <div>
            <p className="font-medium text-foreground">Noch keine Bestellungen verfügbar</p>
            <p className="text-sm text-muted-foreground">Sobald deine Kunden neue Bestellungen aufgeben, erscheinen sie hier.</p>
          </div>
        </div>
      );
    }

    const navigateToOrder = (order: DashboardOrderSummary) => {
      if (!order.customerId) {
        return;
      }
      const target = `/customer/${order.customerId}${order.id ? `?order=${order.id}` : ''}`;
      setLocation(target);
    };

    return (
      <div className="divide-y">
        {orders.map((order) => {
          const clickable = Boolean(order.customerId);

          return clickable ? (
            <button
              key={order.id}
              type="button"
              onClick={() => navigateToOrder(order)}
              className="w-full bg-card px-6 py-4 text-left transition hover:bg-primary/5"
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">{order.orderNumber ? `#${order.orderNumber}` : 'Ohne Nummer'}</Badge>
                    {order.status && (
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{order.status}</span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-base font-semibold text-foreground">
                      {order.customerName ?? 'Unbekannter Kunde'}
                    </span>
                    {order.customerCompany && (
                      <span className="text-sm text-muted-foreground">{order.customerCompany}</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                    {order.customerNumber && <span>Kundennummer: {order.customerNumber}</span>}
                    {order.orderDate && <span>{formatDate(order.orderDate)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold text-foreground">
                    {formatCurrency(order.totalAmount, order.currency)}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </button>
          ) : (
            <div key={order.id} className="bg-card px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">{order.orderNumber ? `#${order.orderNumber}` : 'Ohne Nummer'}</Badge>
                    {order.status && (
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{order.status}</span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-base font-semibold text-foreground">
                      {order.customerName ?? 'Unbekannter Kunde'}
                    </span>
                    {order.customerCompany && (
                      <span className="text-sm text-muted-foreground">{order.customerCompany}</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                    {order.customerNumber && <span>Kundennummer: {order.customerNumber}</span>}
                    {order.orderDate && <span>{formatDate(order.orderDate)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold text-foreground">
                    {formatCurrency(order.totalAmount, order.currency)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [orders, hasOrders, isLoading, isError, error, refetch]);

  const startMicrosoftOAuth = useCallback(() => {
    if (isStartingOAuth) return;

    setIsStartingOAuth(true);
    api.get('/api/microsoft/oauth-url')
      .then((response) => {
        const authUrl = response.data?.url;
        if (authUrl) {
          window.location.href = authUrl;
        } else {
          toast({
            title: 'Kalender',
            description: 'Die Anmelde-URL konnte nicht erstellt werden.',
            variant: 'destructive'
          });
        }
      })
      .catch(() => {
        toast({
          title: 'Kalender',
          description: 'Die Verbindung konnte nicht gestartet werden.',
          variant: 'destructive'
        });
      })
      .finally(() => {
        setIsStartingOAuth(false);
      });
  }, [isStartingOAuth, toast]);

  const calendarContent = useMemo(() => {
    if (calendarLoading || calendarFetching) {
      return (
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Kalender wird synchronisiert…
        </div>
      );
    }

    if (calendarIsError) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-red-600">
          <p>{calendarErrorMessage}</p>
          <button
            type="button"
            onClick={() => refetchCalendar()}
            className="text-primary underline"
          >
            Erneut versuchen
          </button>
        </div>
      );
    }

    if (!isCalendarConfigured) {
      return (
        <div className="space-y-3 p-6 text-sm text-muted-foreground">
          <p>Microsoft 365 ist noch nicht konfiguriert. Bitte ergänze die Azure-Zugangsdaten in der `.env.local`.</p>
        </div>
      );
    }

    if (!isCalendarConnected) {
      return (
        <div className="flex flex-col items-center gap-4 p-6 text-center text-sm text-muted-foreground">
          <CalendarDays className="h-10 w-10 text-primary" />
          <div>
            <p className="font-medium text-foreground">Kalender noch nicht verbunden</p>
            <p className="mt-1">Verbinde deinen Microsoft-Kalender, um Termine direkt hier zu sehen.</p>
          </div>
          <Button
            type="button"
            onClick={startMicrosoftOAuth}
            disabled={isStartingOAuth}
            className="w-full sm:w-auto"
          >
            <Plug className="mr-2 h-4 w-4" />
            Kalender verbinden
          </Button>
        </div>
      );
    }

    if (!calendarEvents.length) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
          <CalendarDays className="h-9 w-9" />
          <div>
            <p className="font-medium text-foreground">Keine kommenden Termine</p>
            <p className="text-sm">Neue Termine erscheinen hier automatisch.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {calendarEvents.map((event) => (
          <div key={event.id} className="rounded-lg border border-border bg-card/80 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {event.subject || 'Ohne Betreff'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCalendarRange(event)}
                </p>
                {event.location && (
                  <p className="text-xs text-muted-foreground">📍 {event.location}</p>
                )}
                {event.organizer && (
                  <p className="text-xs text-muted-foreground">Organisiert von {event.organizer}</p>
                )}
              </div>
              {event.onlineMeetingUrl && (
                <a
                  href={event.onlineMeetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary transition hover:text-primary/80"
                  title="Online-Meeting öffnen"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }, [calendarLoading, calendarFetching, calendarIsError, calendarErrorMessage, refetchCalendar, isCalendarConfigured, isCalendarConnected, calendarEvents, isStartingOAuth, startMicrosoftOAuth]);

  const tasksContent = useMemo(() => {
    if (!user?.id) {
      return (
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          Benutzerdaten werden geladen…
        </div>
      );
    }

    if (tasksLoadingState) {
      return (
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Aufgaben werden geladen…
        </div>
      );
    }

    if (tasksIsError) {
      const message = tasksError instanceof Error ? tasksError.message : 'Aufgaben konnten nicht geladen werden.';
      return (
        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-red-600">
          <p>{message}</p>
          <button
            type="button"
            onClick={() => refetchTasks()}
            className="text-primary underline"
          >
            Erneut versuchen
          </button>
        </div>
      );
    }

    if (tasks.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
          <CheckSquare className="h-8 w-8" />
          <div>
            <p className="font-medium text-foreground">Keine Aufgaben vorhanden</p>
            <p className="text-sm">Neue oder zugewiesene Aufgaben erscheinen hier automatisch.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {tasks.map((task: Task) => {
          const statusLabel = TASK_STATUS_LABEL[task.status];
          const priorityLabel = task.priority ? TASK_PRIORITY_LABEL[task.priority] : null;
          const priorityColor = task.priority ? TASK_PRIORITY_COLOR[task.priority] : null;
          const scheduleLabel = task.dueAt
            ? `Fällig: ${formatDate(task.dueAt)}`
            : task.startAt
            ? `Start: ${formatDate(task.startAt)}`
            : 'Kein Termin hinterlegt';

          return (
            <button
              key={task.id}
              type="button"
              onClick={() => setLocation(`/tasks/${task.id}`)}
              className="w-full rounded-lg border border-border bg-card/80 p-3 text-left transition hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge className={`capitalize ${TASK_STATUS_CLASS[task.status]}`}>{statusLabel}</Badge>
                  {priorityLabel && priorityColor && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${priorityColor}`} />
                      {priorityLabel}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-foreground">{task.title}</p>
                {task.customerName && (
                  <p className="text-xs text-muted-foreground">{task.customerName}</p>
                )}
                <p className="text-xs text-muted-foreground">{scheduleLabel}</p>
              </div>
            </button>
          );
        })}
      </div>
    );
  }, [tasksLoadingState, tasksIsError, tasksError, refetchTasks, tasks, user?.id]);

  const tasksSummaryLabel = useMemo(() => {
    if (!tasksSummary) {
      return null;
    }

    const parts: string[] = [];
    if (tasksSummary.open > 0) parts.push(`Offen ${tasksSummary.open}`);
    if (tasksSummary.inProgress > 0) parts.push(`In Bearbeitung ${tasksSummary.inProgress}`);
    if (tasksSummary.waiting > 0) parts.push(`Wartend ${tasksSummary.waiting}`);

    return parts.join(' • ');
  }, [tasksSummary]);

  useEffect(() => {
    if (!location.includes('?')) {
      return;
    }

    const [pathname, search = ''] = location.split('?');
    const params = new URLSearchParams(search);
    const status = params.get('calendar');

    if (!status) {
      return;
    }

    params.delete('calendar');
    const newSearch = params.toString();

    if (typeof window !== 'undefined') {
      const newUrl = `${pathname}${newSearch ? `?${newSearch}` : ''}`;
      window.history.replaceState(null, '', newUrl);
    }

    if (status === 'connected') {
      toast({
        title: 'Microsoft-Kalender verbunden',
        description: 'Die Synchronisierung wurde erfolgreich eingerichtet.'
      });
      refetchCalendar();
    } else if (status === 'expired') {
      toast({
        title: 'Verbindung abgelaufen',
        description: 'Bitte starte die Verbindung erneut.',
        variant: 'destructive'
      });
    } else if (status === 'error') {
      toast({
        title: 'Verbindung fehlgeschlagen',
        description: 'Die Anmeldung bei Microsoft ist fehlgeschlagen.',
        variant: 'destructive'
      });
    }
  }, [location, toast, refetchCalendar]);

  const handleDisconnect = () => {
    if (isDisconnecting) {
      return;
    }

    setIsDisconnecting(true);
    api.delete('/api/microsoft')
      .then(() => {
        toast({
          title: 'Kalender getrennt',
          description: 'Der Microsoft-Kalender wurde getrennt.'
        });
        refetchCalendar();
      })
      .catch(() => {
        toast({
          title: 'Trennen fehlgeschlagen',
          description: 'Die Verbindung konnte nicht getrennt werden.',
          variant: 'destructive'
        });
      })
      .finally(() => {
        setIsDisconnecting(false);
      });
  };

  return (
    <>
      <TopBar
        title="Dashboard"
        showSearch={false}
        actions={(
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LayoutDashboard className="h-4 w-4" />
            Überblick über deine Kundenaktivitäten
          </div>
        )}
      />
      <main className="flex-1 overflow-auto bg-background p-6">
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <Card key={metric.label} className="bg-card">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                        <p className="mt-1 text-2xl font-semibold text-foreground">{metric.value}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{metric.description}</p>
                      </div>
                      <div className="rounded-full bg-primary/10 p-3 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="grid gap-6 lg:grid-cols-[2fr,1fr,1fr]">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Letzte Bestellungen</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Aktuelle Bestellungen deiner zugewiesenen Kunden
                  </p>
                </div>
                <Link href="/customers" className="text-sm text-primary hover:underline">
                  Kunden ansehen
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {sectionContent}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Aufgaben</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Überblick deiner zugewiesenen Aufgaben
                  </p>
                  {tasksSummaryLabel && (
                    <p className="text-xs text-muted-foreground">{tasksSummaryLabel}</p>
                  )}
                </div>
                <Link href="/tasks" className="text-sm text-primary hover:underline">
                  Aufgaben öffnen
                </Link>
              </CardHeader>
              <CardContent>
                {tasksContent}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-lg">Kalender</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Termine aus deinem Microsoft-Standardkalender
                  </p>
                  <Badge variant={calendarStatusVariant}>
                    {calendarStatusLabel}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isCalendarConfigured && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => refetchCalendar()}
                      disabled={calendarLoading || calendarFetching}
                      title="Kalender aktualisieren"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                  {isCalendarConfigured && isCalendarConnected && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDisconnect}
                      disabled={isDisconnecting}
                    >
                      <Unlink className="mr-2 h-4 w-4" />
                      Trennen
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {calendarContent}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
