export type TaskStatus = "open" | "in_progress" | "waiting" | "completed";
export type TaskPriority = "low" | "medium" | "high";
export type TaskCategory = "follow_up" | "tasting" | "campaign" | "other";

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  customerId?: string | null;
  customerName?: string | null;
  customerCompany?: string | null;
  customerNumber?: string | null;
  assignedToId?: string | null;
  assignedToName?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  startAt?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  startedAt?: string | null;
  slaMinutes?: number | null;
  metadata?: Record<string, unknown> | null;
  predecessors?: TaskDependencyEdge[];
  successors?: TaskDependencyEdge[];
  watchers?: TaskWatcher[];
  attachments?: TaskAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskDependencyEdge {
  taskId: string;
  relatedTaskId: string;
  direction: 'predecessor' | 'successor';
  relationType?: string | null;
}

export interface TaskListResponse {
  tasks: Task[];
  summary?: TaskSummary;
}

export interface TaskResponse {
  task: Task;
}

export interface TaskSummary {
  open: number;
  inProgress: number;
  waiting: number;
  completed: number;
}

export interface TaskListFilters {
  status?: TaskStatus[];
  assigneeIds?: string[];
  search?: string;
  customerId?: string;
  from?: string;
  to?: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: TaskCategory;
  customerId?: string | null;
  assignedToId?: string | null;
  startAt?: string | null;
  dueAt?: string | null;
  slaMinutes?: number | null;
  metadata?: Record<string, unknown> | null;
  watcherIds?: string[];
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: TaskCategory;
  customerId?: string | null;
  assignedToId?: string | null;
  startAt?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  startedAt?: string | null;
  slaMinutes?: number | null;
  metadata?: Record<string, unknown> | null;
  dependencies?: {
    predecessorIds?: string[];
    successorIds?: string[];
  };
  watchers?: {
    add?: string[];
    remove?: string[];
  };
  attachments?: {
    add?: TaskAttachmentInput[];
    removeIds?: string[];
  };
}

export interface TaskWatcher {
  id: string;
  userId: string;
  name: string;
  email: string;
  joinedAt: string;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  fileName: string;
  fileUrl: string;
  uploadedBy?: string | null;
  uploadedByName?: string | null;
  uploadedAt: string;
}

export interface TaskAttachmentInput {
  fileName: string;
  fileUrl: string;
}
