export type InteractionType = "phone" | "email" | "meeting" | "chat";

export type FollowUpPriority = "high" | "medium" | "low";
export type FollowUpReminder = "popup" | "email" | "none";

export interface FollowUpTask {
  title: string;
  dueDate: string;
  assignee?: string | null;
  priority: FollowUpPriority;
  reminder: FollowUpReminder;
}

export interface CustomerInteraction {
  id: string;
  customerId: string;
  type: InteractionType;
  occurredAt: string;
  employee?: string | null;
  durationSeconds?: number | null;
  topic?: string | null;
  result?: string | null;
  notes?: string | null;
  attachmentsCount?: number | null;
  followUp?: FollowUpTask | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInteractionsResponse {
  interactions: CustomerInteraction[];
}

export interface CreateCustomerInteractionRequest {
  type: InteractionType;
  occurredAt: string;
  employee?: string | null;
  durationSeconds?: number | null;
  topic?: string | null;
  result?: string | null;
  notes?: string | null;
  attachmentsCount?: number | null;
  followUp?: FollowUpTask | null;
  metadata?: Record<string, unknown> | null;
}

