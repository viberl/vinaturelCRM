import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, differenceInCalendarDays, isToday } from "date-fns";
import { de } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { CalendarIcon, Check, ChevronLeft, ChevronRight, Clock, Eye, Loader2, Paperclip, Plus, Trash2, Users } from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import TopBar from "@/components/TopBar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";
import { fetchAllCustomers } from "@/lib/customerApi";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { Task, TaskStatus, TaskPriority, TaskCategory, TaskListResponse, CreateTaskRequest } from "@shared/types/task";
import type { MapCustomer } from "@shared/types/map-customer";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role?: string;
}

type TaskView = "list" | "kanban" | "calendar" | "timeline";

const TASK_STATUSES: TaskStatus[] = ["open", "in_progress", "waiting", "completed"];
const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  waiting: "Wartet",
  completed: "Erledigt",
};

const TASK_STATUS_INTENT: Record<TaskStatus, string> = {
  open: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
  in_progress: "bg-blue-200 text-blue-900 dark:bg-blue-500/20 dark:text-blue-100",
  waiting: "bg-amber-200 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  completed: "bg-emerald-200 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100",
};

const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
};

const TASK_PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: "high", label: "Hoch" },
  { value: "medium", label: "Mittel" },
  { value: "low", label: "Niedrig" },
];

const DATE_PICKER_FORMAT = "yyyy-MM-dd";

const formatDateForInput = (iso?: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, DATE_PICKER_FORMAT);
};

const toIsoDate = (date: Date) => {
  const iso = new Date(date);
  iso.setHours(12, 0, 0, 0);
  return iso.toISOString();
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const getCardBorderByCategory = (category?: TaskCategory | null) => {
  switch (category) {
    case "follow_up":
      return "border-emerald-200 dark:border-emerald-800";
    case "tasting":
      return "border-purple-200 dark:border-purple-800";
    case "campaign":
      return "border-blue-200 dark:border-blue-800";
    default:
      return "border-border";
  }
};

const getTimelineColor = (status: TaskStatus): string => {
  switch (status) {
    case "completed":
      return "#10b981";
    case "in_progress":
      return "#3b82f6";
    case "waiting":
      return "#f59e0b";
    default:
      return "#64748b";
  }
};

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge className={cn("capitalize", TASK_STATUS_INTENT[status])}>{TASK_STATUS_LABEL[status]}</Badge>;
}

function TaskPriorityDot({ priority }: { priority: TaskPriority }) {
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full", TASK_PRIORITY_COLOR[priority])} />;
}

export default function TasksPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [matchTaskRoute, taskRouteParams] = useRoute<{ taskId: string }>("/tasks/:taskId");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [view, setView] = useState<TaskView>("list");
  const [selectedStatuses, setSelectedStatuses] = useState<TaskStatus[]>(["open", "in_progress", "waiting"]);
  const [searchTerm, setSearchTerm] = useState("");
  const [calendarCursor, setCalendarCursor] = useState<Date>(new Date());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isTaskDetailOpen, setIsTaskDetailOpen] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const routeTaskId = matchTaskRoute ? taskRouteParams.taskId : null;

  const filters = useMemo(
    () => ({
      status: selectedStatuses,
      search: searchTerm.trim() || null,
    }),
    [selectedStatuses, searchTerm]
  );

  const tasksQueryKey = useMemo(
    () => [
      "/admin-api/tasks",
      {
        status: filters.status.join(","),
        search: filters.search ?? "",
      },
    ],
    [filters]
  );

  const { data: taskData, isLoading: tasksLoading, isFetching: tasksFetching } = useQuery<TaskListResponse>({
    queryKey: tasksQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status.length > 0) params.set("status", filters.status.join(","));
      if (filters.search) params.set("search", filters.search);
      const response = await api.get("/admin-api/tasks", { params });
      return response.data as TaskListResponse;
    },
  });

  const { data: teamData } = useQuery<{ users: TeamMember[] }>({
    queryKey: ["/admin-api/team"],
    queryFn: async () => {
      const response = await api.get("/admin-api/team");
      return response.data as { users: TeamMember[] };
    },
    enabled: Boolean(user),
  });

  const { data: customersData } = useQuery<MapCustomer[]>({
    queryKey: ["/admin-api/search/customer", "tasks"],
    queryFn: async () => fetchAllCustomers(500),
    enabled: Boolean(user),
  });

  const currentTasks: Task[] = taskData?.tasks ?? [];
  const teamMembersList = useMemo(() => {
    const baseMembers = teamData?.users ?? [];
    const memberMap = new Map<string, TeamMember>();

    baseMembers.forEach((member) => {
      memberMap.set(member.id, member);
    });

    if (user?.id) {
      memberMap.set(user.id, {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    }

    currentTasks.forEach((task) => {
      if (task.assignedToId && task.assignedToName && !memberMap.has(task.assignedToId)) {
        memberMap.set(task.assignedToId, {
          id: task.assignedToId,
          name: task.assignedToName,
          email: task.assignedToName,
        });
      }

      (task.watchers ?? []).forEach((watcher) => {
        if (!memberMap.has(watcher.userId)) {
          memberMap.set(watcher.userId, {
            id: watcher.userId,
            name: watcher.name ?? watcher.email ?? watcher.userId,
            email: watcher.email ?? watcher.name ?? watcher.userId,
          });
        }
      });
    });

    return Array.from(memberMap.values()).sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
  }, [teamData, currentTasks, user]);

  const createTaskMutation = useMutation({
    mutationFn: async (payload: CreateTaskRequest) => {
      const response = await api.post("/admin-api/tasks", payload);
      return response.data.task as Task;
    },
    onSuccess: (createdTask) => {
      queryClient.setQueryData<TaskListResponse | undefined>(tasksQueryKey, (existing) => {
        if (!existing) {
          return { tasks: [createdTask] };
        }

        const nextTasks = [createdTask, ...existing.tasks.filter((task) => task.id !== createdTask.id)];
        return { ...existing, tasks: nextTasks };
      });

      toast({
        title: "Aufgabe erstellt",
        description: "Die neue Aufgabe wurde angelegt und kann jetzt bearbeitet werden.",
      });

      setIsCreateSheetOpen(false);
      setSelectedTaskId(createdTask.id);
      setIsTaskDetailOpen(true);
      setLocation(`/tasks/${createdTask.id}`);
    },
    onError: (error: unknown) => {
      console.error("Task creation failed", error);
      toast({
        title: "Erstellung fehlgeschlagen",
        description: "Die Aufgabe konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, payload }: { taskId: string; payload: Partial<Task> & Record<string, unknown> }) => {
      const response = await api.patch(`/admin-api/tasks/${taskId}`, payload);
      return response.data.task as Task;
    },
    onSuccess: (updatedTask) => {
      queryClient.setQueryData<TaskListResponse | undefined>(tasksQueryKey, (existing) => {
        if (!existing) return existing;
        const tasks = existing.tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
        return { ...existing, tasks };
      });
    },
    onError: (error: unknown) => {
      console.error("Task update failed", error);
      toast({
        title: "Aktualisierung fehlgeschlagen",
        description: "Die Aufgabe konnte nicht geändert werden.",
        variant: "destructive",
      });
    },
  });

  const handleStatusToggle = (values: string[]) => {
    if (values.length === 0) {
      setSelectedStatuses(TASK_STATUSES);
      return;
    }
    setSelectedStatuses(values.filter((value): value is TaskStatus => TASK_STATUSES.includes(value as TaskStatus)));
  };

  const handleUpdateTask = (taskId: string, payload: Record<string, unknown>) => {
    updateTaskMutation.mutate({ taskId, payload });
  };

  const handleCreateTask = (payload: CreateTaskRequest) => {
    createTaskMutation.mutate(payload);
  };

  const handleOpenTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    setIsTaskDetailOpen(true);
    setLocation(`/tasks/${taskId}`);
  };

  const handleCloseTask = () => {
    setIsTaskDetailOpen(false);
    setSelectedTaskId(null);
    setLocation("/tasks");
  };

  const handleCalendarDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const [type, payload] = result.destination.droppableId.split(":");
    if (type !== "calendar") return;
    const dueDateIso = new Date(payload);
    if (Number.isNaN(dueDateIso.getTime())) return;
    handleUpdateTask(result.draggableId, {
      dueAt: toIsoDate(dueDateIso),
    });
  };

  const handleKanbanDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const nextStatus = result.destination.droppableId as TaskStatus;
    if (!TASK_STATUSES.includes(nextStatus)) return;
    const draggableTask = taskData?.tasks.find((task) => task.id === result.draggableId);
    if (!draggableTask || draggableTask.status === nextStatus) return;
    handleUpdateTask(draggableTask.id, { status: nextStatus });
  };

  const selectedTask = useMemo(
    () => currentTasks.find((task) => task.id === selectedTaskId) ?? null,
    [currentTasks, selectedTaskId]
  );

  useEffect(() => {
    if (!selectedTask && isTaskDetailOpen && !tasksLoading && !tasksFetching) {
      setIsTaskDetailOpen(false);
    }
  }, [selectedTask, isTaskDetailOpen, tasksLoading, tasksFetching]);

  useEffect(() => {
    if (routeTaskId) {
      if (routeTaskId !== selectedTaskId) {
        setSelectedTaskId(routeTaskId);
      }
      if (!isTaskDetailOpen) {
        setIsTaskDetailOpen(true);
      }
    } else {
      if (selectedTaskId) {
        setSelectedTaskId(null);
      }
      if (isTaskDetailOpen) {
        setIsTaskDetailOpen(false);
      }
    }
  }, [routeTaskId, selectedTaskId, isTaskDetailOpen]);

  const monthStart = startOfMonth(calendarCursor);
  const monthEnd = endOfMonth(calendarCursor);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays: Date[] = [];
  for (let cursor = calendarStart; cursor <= calendarEnd; cursor = addDays(cursor, 1)) {
    calendarDays.push(cursor);
  }

  return (
    <>
      <TopBar
        title="Aufgaben"
        showSearch={false}
        actions={
          <Button onClick={() => setIsCreateSheetOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Neue Aufgabe
          </Button>
        }
      />
      <main className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col overflow-hidden">
          <div className="border-b border-border bg-background">
            <div className="flex flex-wrap items-center gap-4 px-6 py-4">
              <div className="flex items-center gap-2">
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Aufgaben durchsuchen"
                  className="w-72"
                />
                {(tasksFetching || tasksLoading) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <ToggleGroup type="multiple" value={selectedStatuses} onValueChange={handleStatusToggle} className="flex flex-wrap">
                {TASK_STATUSES.map((status) => (
                  <ToggleGroupItem key={status} value={status} className="capitalize">
                    {TASK_STATUS_LABEL[status]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>

          <div className="flex-1 overflow-auto px-6 pb-6">
            <Tabs value={view} onValueChange={(value) => setView(value as TaskView)}>
              <TabsList className="mb-4 flex flex-wrap gap-2">
                <TabsTrigger value="list">Meine Aufgaben</TabsTrigger>
                <TabsTrigger value="kanban">Kanban</TabsTrigger>
                <TabsTrigger value="calendar">Kalender</TabsTrigger>
                <TabsTrigger value="timeline">Gantt / Timeline</TabsTrigger>
              </TabsList>

              <TabsContent value="list" className="flex flex-col gap-4">
                <Card className="overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Aufgabe</TableHead>
                        <TableHead>Kunde</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Fällig</TableHead>
                        <TableHead>Priorität</TableHead>
                        <TableHead className="text-right">Quick-Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentTasks.map((task) => {
                        const isWatching = user?.id ? (task.watchers ?? []).some((watcher) => watcher.userId === user.id) : false;
                        return (
                          <TableRow
                            key={task.id}
                            className="align-middle cursor-pointer transition-colors hover:bg-muted/40"
                            onClick={() => handleOpenTask(task.id)}
                          >
                            <TableCell className="max-w-[280px]">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <TaskPriorityDot priority={task.priority} />
                                  <span className="font-medium text-foreground">{task.title}</span>
                                </div>
                                {task.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  Erstellt am {format(new Date(task.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
                                </p>
                                {isWatching && (
                                  <Badge variant="outline" className="flex w-fit items-center gap-1 text-[10px]">
                                    <Eye className="h-3 w-3" /> Beobachter
                                  </Badge>
                                )}
                                {(task.attachments?.length ?? 0) > 0 && (
                                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Paperclip className="h-3 w-3" /> {task.attachments?.length} Datei(en)
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col text-sm">
                                {task.customerId ? (
                                  <Link
                                    href={`/customer/${task.customerId}`}
                                    className="font-medium text-foreground hover:underline"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    {task.customerName ?? task.customerCompany ?? "–"}
                                  </Link>
                                ) : (
                                  <span className="font-medium text-muted-foreground">{task.customerName ?? "–"}</span>
                                )}
                                {task.customerCompany && (
                                  <span className="text-xs text-muted-foreground">{task.customerCompany}</span>
                                )}
                                {task.customerNumber && (
                                  <span className="text-xs text-muted-foreground">Kundennr. {task.customerNumber}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <TaskStatusBadge status={task.status} />
                            </TableCell>
                            <TableCell>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="justify-start gap-2"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <CalendarIcon className="h-4 w-4" />
                                    {task.dueAt ? format(new Date(task.dueAt), "dd.MM.yyyy", { locale: de }) : "Kein Datum"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start" onClick={(event) => event.stopPropagation()}>
                                  <Calendar
                                    mode="single"
                                    selected={task.dueAt ? new Date(task.dueAt) : undefined}
                                    onSelect={(date) => {
                                      if (!date) {
                                        handleUpdateTask(task.id, { dueAt: null });
                                      } else {
                                        handleUpdateTask(task.id, { dueAt: toIsoDate(date) });
                                      }
                                    }}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                            </TableCell>
                            <TableCell>
                              <Badge className="capitalize">
                                <span className="flex items-center gap-1">
                                  <TaskPriorityDot priority={task.priority} />
                                  {TASK_PRIORITY_LABEL[task.priority]}
                                </span>
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <Select
                                  value={task.status}
                                  onValueChange={(value) => handleUpdateTask(task.id, { status: value })}
                                >
                                  <SelectTrigger
                                    className="w-[140px]"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <SelectValue placeholder="Status" />
                                  </SelectTrigger>
                                  <SelectContent onClick={(event) => event.stopPropagation()}>
                                    {TASK_STATUSES.map((status) => (
                                      <SelectItem key={status} value={status}>
                                        {TASK_STATUS_LABEL[status]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {currentTasks.length === 0 && !tasksLoading && (
                        <TableRow>
                          <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                            Keine Aufgaben im aktuellen Filter.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Card>
              </TabsContent>

              <TabsContent value="kanban" className="mt-6">
                <DragDropContext onDragEnd={handleKanbanDragEnd}>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {TASK_STATUSES.map((status) => {
                      const columnTasks: Task[] = currentTasks.filter((task: Task) => task.status === status);
                      return (
                        <Card key={status} className="flex h-full flex-col">
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-base font-semibold capitalize">
                              {TASK_STATUS_LABEL[status]}
                            </CardTitle>
                            <Badge variant="secondary">{columnTasks.length}</Badge>
                          </CardHeader>
                          <CardContent className="flex-1 overflow-hidden p-0">
                            <Droppable droppableId={status}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.droppableProps}
                                  className={cn(
                                    "flex h-full flex-col gap-3 p-4",
                                    snapshot.isDraggingOver && "bg-muted/60"
                                  )}
                                >
                                  {columnTasks.map((task, index) => (
                                    <Draggable key={task.id} draggableId={task.id} index={index}>
                                      {(dragProvided, dragSnapshot) => (
                                        <div
                                          ref={dragProvided.innerRef}
                                          {...dragProvided.draggableProps}
                                          {...dragProvided.dragHandleProps}
                                          className={cn(
                                            "rounded-lg border bg-card p-4 text-sm shadow-sm transition-shadow",
                                            getCardBorderByCategory(task.category),
                                            dragSnapshot.isDragging && "shadow-lg"
                                          )}
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="font-semibold text-foreground">{task.title}</div>
                                            <TaskPriorityDot priority={task.priority} />
                                          </div>
                                          {task.customerName && (
                                            <p className="mt-1 text-xs text-muted-foreground">{task.customerName}</p>
                                          )}
                                          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                                            <Clock className="h-3.5 w-3.5" />
                                            {task.dueAt
                                              ? `Fällig ${format(new Date(task.dueAt), "dd.MM.yyyy", { locale: de })}`
                                              : "Kein Fälligkeitsdatum"}
                                          </div>
                                          {task.assignedToName && (
                                            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                              <Check className="h-3.5 w-3.5" />
                                              {task.assignedToName}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </Draggable>
                                  ))}
                                  {provided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </DragDropContext>
              </TabsContent>

              <TabsContent value="calendar" className="mt-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg font-semibold">Kalenderübersicht</CardTitle>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" onClick={() => setCalendarCursor(subMonths(calendarCursor, 1))}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div className="min-w-[140px] text-center text-sm font-medium text-foreground">
                        {format(calendarCursor, "LLLL yyyy", { locale: de })}
                      </div>
                      <Button variant="outline" size="icon" onClick={() => setCalendarCursor(addMonths(calendarCursor, 1))}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <DragDropContext onDragEnd={handleCalendarDragEnd}>
                      <div className="grid grid-cols-7 gap-2 text-xs font-semibold uppercase text-muted-foreground">
                        {Array.from({ length: 7 }).map((_, index) => (
                          <div key={index} className="px-2 py-1">
                            {format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), index), "EEE", { locale: de })}
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 grid grid-cols-7 gap-2">
                        {calendarDays.map((day) => {
                          const isoDate = format(day, DATE_PICKER_FORMAT);
                          const dayTasks: Task[] = currentTasks.filter((task: Task) => {
                            if (!task.dueAt) return false;
                            return formatDateForInput(task.dueAt) === isoDate;
                          });
                          const isCurrentMonth = day.getMonth() === monthStart.getMonth();
                          return (
                            <Droppable droppableId={`calendar:${isoDate}`} key={isoDate}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.droppableProps}
                                  className={cn(
                                    "min-h-[140px] rounded-lg border p-2 text-xs",
                                    isCurrentMonth ? "bg-card" : "bg-muted/40 text-muted-foreground",
                                    snapshot.isDraggingOver && "border-primary"
                                  )}
                                >
                                  <div className={cn(
                                    "mb-2 flex items-center justify-between",
                                    isToday(day) && "text-primary"
                                  )}>
                                    <span className="font-semibold">{format(day, "d.", { locale: de })}</span>
                                    {isToday(day) && <Badge variant="secondary">Heute</Badge>}
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    {dayTasks.map((task, index) => (
                                      <Draggable draggableId={task.id} index={index} key={task.id}>
                                        {(dragProvided) => (
                                          <div
                                            ref={dragProvided.innerRef}
                                            {...dragProvided.draggableProps}
                                            {...dragProvided.dragHandleProps}
                                            className={cn(
                                              "rounded-md border border-border bg-background p-2 text-[11px] shadow-sm",
                                              getCardBorderByCategory(task.category)
                                            )}
                                          >
                                            <div className="flex items-center gap-1">
                                              <TaskPriorityDot priority={task.priority} />
                                              <span className="font-medium text-foreground">{task.title}</span>
                                            </div>
                                            {task.startAt && (
                                              <p className="mt-1 text-muted-foreground">
                                                Start {format(new Date(task.startAt), "dd.MM", { locale: de })}
                                              </p>
                                            )}
                                          </div>
                                        )}
                                      </Draggable>
                                    ))}
                                    {provided.placeholder}
                                  </div>
                                </div>
                              )}
                            </Droppable>
                          );
                        })}
                      </div>
                    </DragDropContext>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="timeline" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TimelineView tasks={currentTasks} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            <TaskDetailSheet
              task={selectedTask}
              isOpen={isTaskDetailOpen}
              onClose={handleCloseTask}
              teamMembers={teamMembersList}
              onUpdate={handleUpdateTask}
              currentUserId={user?.id ?? null}
              isUpdating={updateTaskMutation.isPending}
            />
            <TaskCreateSheet
              isOpen={isCreateSheetOpen}
              onClose={() => setIsCreateSheetOpen(false)}
              onCreate={handleCreateTask}
              teamMembers={teamMembersList}
              customers={customersData ?? []}
              currentUserId={user?.id ?? null}
              isSubmitting={createTaskMutation.isPending}
            />
          </div>
        </div>
      </main>
    </>
  );
}

interface TaskDetailSheetProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  teamMembers: TeamMember[];
  onUpdate: (taskId: string, payload: Record<string, unknown>) => void;
  currentUserId: string | null;
  isUpdating: boolean;
}

interface TaskCreateSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (payload: CreateTaskRequest) => void;
  teamMembers: TeamMember[];
  customers: MapCustomer[];
  currentUserId: string | null;
  isSubmitting: boolean;
}

function TaskCreateSheet({
  isOpen,
  onClose,
  onCreate,
  teamMembers,
  customers,
  currentUserId,
  isSubmitting,
}: TaskCreateSheetProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>("open");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [assignedToId, setAssignedToId] = useState<string | "unassigned">("unassigned");
  const [customerId, setCustomerId] = useState<string | "unassigned">("unassigned");
  const [watcherIds, setWatcherIds] = useState<string[]>(currentUserId ? [currentUserId] : []);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDescription("");
      setPriority("medium");
      setStatus("open");
      setDueDate(null);
      setStartDate(null);
      setAssignedToId(currentUserId ?? "unassigned");
      setCustomerId("unassigned");
      setWatcherIds(currentUserId ? [currentUserId] : []);
    }
  }, [isOpen, currentUserId]);

  const handleWatcherToggle = (userId: string, checked: boolean) => {
    setWatcherIds((prev) => {
      if (checked) {
        if (prev.includes(userId)) return prev;
        return [...prev, userId];
      }
      return prev.filter((id) => id !== userId);
    });
  };

  const handleSubmit = () => {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle) {
      toast({
        title: "Titel erforderlich",
        description: "Bitte gib einen Titel für die Aufgabe ein.",
        variant: "destructive",
      });
      return;
    }

    const payload: CreateTaskRequest = {
      title: trimmedTitle,
      description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
      priority,
      status,
      assignedToId: assignedToId === "unassigned" ? undefined : assignedToId,
      customerId: customerId === "unassigned" ? undefined : customerId,
      dueAt: dueDate ? toIsoDate(dueDate) : undefined,
      startAt: startDate ? toIsoDate(startDate) : undefined,
      watcherIds: watcherIds.length > 0 ? watcherIds : undefined,
    };

    onCreate(payload);
  };

  const watcherDetails = useMemo(() => {
    const ids = new Set(watcherIds);
    const withFallbacks = Array.from(ids).map((id) => {
      const member = teamMembers.find((entry) => entry.id === id);
      return {
        id,
        name: member?.name ?? member?.email ?? id,
      };
    });
    return withFallbacks;
  }, [watcherIds, teamMembers]);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) {
          onClose();
        }
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Neue Aufgabe</SheetTitle>
          <SheetDescription>Lege eine Aufgabe zur Kundenbetreuung, Verkostung oder Kampagne an.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="new-task-title">Titel</Label>
            <Input
              id="new-task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="z. B. Angebot vorbereiten"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-task-description">Beschreibung</Label>
            <Textarea
              id="new-task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder="Hinweise, Ziele oder Kontext zur Aufgabe"
              disabled={isSubmitting}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((taskStatus) => (
                    <SelectItem key={taskStatus} value={taskStatus}>
                      {TASK_STATUS_LABEL[taskStatus]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priorität</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Priorität" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Startdatum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start gap-2" disabled={isSubmitting}>
                    <CalendarIcon className="h-4 w-4" />
                    {startDate ? format(startDate, "dd.MM.yyyy", { locale: de }) : "Kein Startdatum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate ?? undefined}
                    onSelect={(date) => setStartDate(date ?? null)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Fälligkeitsdatum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start gap-2" disabled={isSubmitting}>
                    <CalendarIcon className="h-4 w-4" />
                    {dueDate ? format(dueDate, "dd.MM.yyyy", { locale: de }) : "Kein Fälligkeitsdatum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate ?? undefined}
                    onSelect={(date) => setDueDate(date ?? null)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Zuständig</Label>
              <Select
                value={assignedToId}
                onValueChange={(value) => setAssignedToId(value as string)}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Verantwortliche Person" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Nicht zugewiesen</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Kunde</Label>
              <Select
                value={customerId}
                onValueChange={(value) => setCustomerId(value as string)}
                disabled={isSubmitting || customers.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kunde auswählen" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="unassigned">Keinem Kunden zugeordnet</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                      {customer.customerNumber ? ` · ${customer.customerNumber}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customers.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Keine Kunden gefunden. Stelle sicher, dass dir Kunden zugewiesen sind.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Beobachter</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start gap-2" disabled={isSubmitting}>
                  <Users className="h-4 w-4" />
                  Beobachter auswählen ({watcherIds.length})
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-2" align="start" sideOffset={4}>
                <p className="text-xs text-muted-foreground">Kolleg:innen erhalten Updates zur Aufgabe.</p>
                <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {teamMembers.map((member) => {
                    const checked = watcherIds.includes(member.id);
                    return (
                      <label
                        key={member.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => handleWatcherToggle(member.id, Boolean(value))}
                          disabled={isSubmitting}
                        />
                        <span className="flex-1 truncate">{member.name}</span>
                        {currentUserId === member.id && (
                          <Badge variant="outline" className="text-[10px]">
                            Du
                          </Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            <div className="flex flex-wrap gap-2">
              {watcherDetails.length === 0 && (
                <span className="text-xs text-muted-foreground">Noch keine Beobachter hinzugefügt.</span>
              )}
              {watcherDetails.map((watcher) => (
                <Badge key={watcher.id} variant="secondary">
                  {watcher.name}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <SheetFooter className="mt-6">
          <SheetClose asChild>
            <Button variant="outline" disabled={isSubmitting}>
              Abbrechen
            </Button>
          </SheetClose>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aufgabe erstellen
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function TaskDetailSheet({
  task,
  isOpen,
  onClose,
  teamMembers,
  onUpdate,
  currentUserId,
  isUpdating,
}: TaskDetailSheetProps) {
  const [titleValue, setTitleValue] = useState(task?.title ?? "");
  const [descriptionValue, setDescriptionValue] = useState(task?.description ?? "");
  const [watcherIds, setWatcherIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    setTitleValue(task?.title ?? "");
    setDescriptionValue(task?.description ?? "");
    setWatcherIds(task?.watchers?.map((watcher) => watcher.userId) ?? []);
  }, [task?.id, task?.title, task?.description, task?.watchers]);

  const handleTitleBlur = () => {
    if (!task) return;
    const trimmed = titleValue.trim();
    if (!trimmed) {
      setTitleValue(task.title ?? "");
      return;
    }
    if (trimmed !== task.title) {
      onUpdate(task.id, { title: trimmed });
    }
  };

  const handleDescriptionBlur = () => {
    if (!task) return;
    const trimmed = descriptionValue.trim();
    const normalized = trimmed.length === 0 ? null : trimmed;
    if (normalized !== (task.description ?? null)) {
      onUpdate(task.id, { description: normalized });
    }
  };

  const handleWatcherToggle = (userId: string, checked: boolean) => {
    if (!task) return;
    setWatcherIds((prev) => {
      const exists = prev.includes(userId);
      if (checked && !exists) {
        return [...prev, userId];
      }
      if (!checked && exists) {
        return prev.filter((id) => id !== userId);
      }
      return prev;
    });

    onUpdate(task.id, {
      watchers: checked ? { add: [userId] } : { remove: [userId] },
    });
  };

  const currentUserIsWatcher = currentUserId ? watcherIds.includes(currentUserId) : false;
  const attachments = task?.attachments ?? [];

  const watcherDetails = useMemo(() => {
    const fallbackNames = new Map<string, string>();
    (task?.watchers ?? []).forEach((watcher) => {
      fallbackNames.set(watcher.userId, watcher.name ?? watcher.email ?? watcher.userId);
    });

    return watcherIds.map((id) => {
      const member = teamMembers.find((member) => member.id === id);
      const name = member?.name ?? fallbackNames.get(id) ?? 'Unbekannt';
      return { id, name };
    });
  }, [watcherIds, teamMembers, task?.watchers]);

  const handleAttachmentSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!task) return;
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const uploads = await Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          fileUrl: await readFileAsDataUrl(file),
        }))
      );

      if (uploads.length > 0) {
        onUpdate(task.id, { attachments: { add: uploads } });
      }
    } catch (error) {
      console.error('Failed to read attachment', error);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Aufgabe bearbeiten</SheetTitle>
          <SheetDescription>
            {task?.customerName ? `Kunde: ${task.customerName}` : "Verwalte alle Details zur Aufgabe."}
          </SheetDescription>
        </SheetHeader>

        {task ? (
          <div className="mt-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="task-title">Titel</Label>
              <Input
                id="task-title"
                value={titleValue}
                onChange={(event) => setTitleValue(event.target.value)}
                onBlur={handleTitleBlur}
                disabled={isUpdating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-description">Beschreibung</Label>
              <Textarea
                id="task-description"
                value={descriptionValue}
                onChange={(event) => setDescriptionValue(event.target.value)}
                onBlur={handleDescriptionBlur}
                rows={5}
                disabled={isUpdating}
                placeholder="Notizen, Kontext oder nächste Schritte"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={task.status}
                  onValueChange={(value) => onUpdate(task.id, { status: value })}
                  disabled={isUpdating}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {TASK_STATUS_LABEL[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priorität</Label>
                <Select
                  value={task.priority}
                  onValueChange={(value) => onUpdate(task.id, { priority: value })}
                  disabled={isUpdating}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Priorität" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fälligkeitsdatum</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start gap-2" disabled={isUpdating}>
                      <CalendarIcon className="h-4 w-4" />
                      {task.dueAt ? format(new Date(task.dueAt), "dd.MM.yyyy", { locale: de }) : "Kein Datum"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={task.dueAt ? new Date(task.dueAt) : undefined}
                      onSelect={(date) => {
                        if (!date) {
                          onUpdate(task.id, { dueAt: null });
                        } else {
                          onUpdate(task.id, { dueAt: toIsoDate(date) });
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Zuständig</Label>
                <Select
                  value={task.assignedToId ?? "unassigned"}
                  onValueChange={(value) => {
                    if (value === "unassigned") {
                      if (!task.assignedToId) return;
                      onUpdate(task.id, { assignedToId: null });
                      return;
                    }
                    if (task.assignedToId === value) return;
                    onUpdate(task.id, { assignedToId: value });
                  }}
                  disabled={isUpdating}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Zuständig" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Nicht zugewiesen</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Beobachter</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start gap-2" disabled={isUpdating}>
                    <Users className="h-4 w-4" />
                    Beobachter auswählen ({watcherIds.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 space-y-2" align="start" sideOffset={4}>
                  <p className="text-xs text-muted-foreground">Mehrere Kollegen können informiert werden.</p>
                  <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                    {teamMembers.map((member) => {
                      const checked = watcherIds.includes(member.id);
                      return (
                        <label
                          key={member.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => handleWatcherToggle(member.id, Boolean(value))}
                            disabled={isUpdating}
                          />
                          <span className="flex-1 truncate">{member.name}</span>
                          {currentUserId === member.id && (
                            <Badge variant="outline" className="text-[10px]">
                              Du
                            </Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              <div className="flex flex-wrap gap-2">
                {watcherDetails.length === 0 && (
                  <span className="text-xs text-muted-foreground">Keine Beobachter hinterlegt.</span>
                )}
                {watcherDetails.map((watcher) => (
                  <Badge key={watcher.id} variant="secondary">
                    {watcher.name}
                  </Badge>
                ))}
              </div>
              {currentUserIsWatcher === false && currentUserId && (
                <p className="text-[11px] text-muted-foreground">
                  Tipp: Füge dich über die Liste hinzu, um über Statusänderungen informiert zu werden.
                </p>
              )}
            </div>

            <div className="space-y-3">
              <Label>Dateien</Label>
              <div className="space-y-2">
                {attachments.length === 0 && (
                  <p className="text-xs text-muted-foreground">Noch keine Dateien angehängt.</p>
                )}
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex flex-col">
                      <a
                        href={attachment.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary hover:underline"
                      >
                        {attachment.fileName}
                      </a>
                      <span className="text-xs text-muted-foreground">
                        {attachment.uploadedAt
                          ? `Hochgeladen am ${format(new Date(attachment.uploadedAt), 'dd.MM.yyyy HH:mm', { locale: de })}`
                          : 'Hochgeladen'}
                        {attachment.uploadedByName ? ` von ${attachment.uploadedByName}` : ''}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isUpdating}
                      onClick={() => onUpdate(task.id, { attachments: { removeIds: [attachment.id] } })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <Input
                  type="file"
                  multiple
                  disabled={isUploading || isUpdating}
                  onChange={handleAttachmentSelect}
                />
                {isUploading && (
                  <p className="text-xs text-muted-foreground">Dateien werden hochgeladen...</p>
                )}
              </div>
            </div>

            <div className="grid gap-2 text-xs text-muted-foreground">
              <span>
                Erstellt am {format(new Date(task.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
              </span>
              <span>
                Aktualisiert am {format(new Date(task.updatedAt), "dd.MM.yyyy HH:mm", { locale: de })}
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">Keine Aufgabe ausgewählt.</p>
        )}

        <SheetFooter className="mt-8">
          <SheetClose asChild>
            <Button variant="outline">Schließen</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

interface TimelineEntry {
  taskId: string;
  title: string;
  assignee?: string | null;
  status: TaskStatus;
  start: Date;
  end: Date;
}

function TimelineView({ tasks }: { tasks: Task[] }) {
  const timelineEntries: TimelineEntry[] = useMemo(() => {
    return tasks
      .filter((task) => task.dueAt || task.startAt)
      .map((task) => {
        const start = task.startAt ? new Date(task.startAt) : new Date(task.createdAt);
        const end = task.dueAt ? new Date(task.dueAt) : new Date(task.startAt ?? task.createdAt);
        if (end < start) {
          end.setTime(start.getTime());
        }
        return {
          taskId: task.id,
          title: task.title,
          assignee: task.assignedToName,
          status: task.status,
          start,
          end,
        } satisfies TimelineEntry;
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [tasks]);

  if (timelineEntries.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Aufgaben mit Terminierung vorhanden.</p>;
  }

  const minDate = timelineEntries.reduce((min, entry) => (entry.start < min ? entry.start : min), timelineEntries[0].start);
  const maxDate = timelineEntries.reduce((max, entry) => (entry.end > max ? entry.end : max), timelineEntries[0].end);
  const totalDays = Math.max(1, differenceInCalendarDays(maxDate, minDate) + 1);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid" style={{ gridTemplateColumns: "240px repeat(" + totalDays + ", minmax(40px, 1fr))" }}>
          <div className="sticky left-0 z-10 border-b border-r border-border bg-background px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">
            Aufgabe
          </div>
          {Array.from({ length: totalDays }).map((_, index) => (
            <div
              key={index}
              className="border-b border-border px-2 py-2 text-xs text-muted-foreground"
            >
              {format(addDays(minDate, index), "dd.MM", { locale: de })}
            </div>
          ))}
          {timelineEntries.map((entry) => {
            const startOffset = differenceInCalendarDays(startOfDay(entry.start), startOfDay(minDate));
            const duration = Math.max(1, differenceInCalendarDays(endOfDay(entry.end), startOfDay(entry.start)) + 1);
            return (
              <TimelineRow
                key={entry.taskId}
                entry={entry}
                offset={startOffset}
                duration={duration}
                totalDays={totalDays}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface TimelineRowProps {
  entry: TimelineEntry;
  offset: number;
  duration: number;
  totalDays: number;
}

function TimelineRow({ entry, offset, duration, totalDays }: TimelineRowProps) {
  const barLeft = (offset / totalDays) * 100;
  const barWidth = (duration / totalDays) * 100;

  return (
    <>
      <div className="border-b border-r border-border px-4 py-3 text-sm">
        <div className="font-semibold text-foreground">{entry.title}</div>
        {entry.assignee && <div className="text-xs text-muted-foreground">{entry.assignee}</div>}
        <div className="mt-1 text-xs text-muted-foreground">
          {format(entry.start, "dd.MM.yyyy", { locale: de })} – {format(entry.end, "dd.MM.yyyy", { locale: de })}
        </div>
      </div>
      <div className="relative border-b border-border py-3" style={{ gridColumn: `span ${totalDays}` }}>
        <div className="absolute inset-y-0 right-0 left-0 grid" style={{ gridTemplateColumns: `repeat(${totalDays}, minmax(40px, 1fr))` }}>
          {Array.from({ length: totalDays }).map((_, index) => (
            <div key={index} className="border-l border-dashed border-muted" />
          ))}
        </div>
        <div
          className="absolute top-1/2 flex -translate-y-1/2 items-center rounded-md px-3 py-2 text-xs font-medium text-white shadow"
          style={{
            left: `calc(${barLeft}% + 12px)`,
            width: `calc(${barWidth}% - 24px)`,
            backgroundColor: getTimelineColor(entry.status),
            minWidth: "120px",
          }}
        >
          {entry.title}
        </div>
      </div>
    </>
  );
}

function endOfDay(date: Date): Date {
  const clone = new Date(date);
  clone.setHours(23, 59, 59, 999);
  return clone;
}

function startOfDay(date: Date): Date {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}
