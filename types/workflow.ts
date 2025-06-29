// Workflow Types
import type { BaseEntity, Timestamp, UUID, WorkflowStatus } from "./base.ts";

// Workflow System Types
import type { Locale } from "./base.ts";
import type { TranslationStatus } from "./content.ts";

export interface Workflow extends BaseEntity {
  name: string;
  description?: string;
  stages: WorkflowStage[];
  isDefault: boolean;
  contentTypes: string[];
}

export interface WorkflowStage {
  id: string;
  name: string;
  description?: string;
  color: string;
  actions: string[];
  permissions: string[];
  autoTransitions?: WorkflowTransition[];
  notifications?: WorkflowNotification[];
}

export interface WorkflowTransition {
  from: string;
  to: string;
  condition?: string;
  delay?: number;
}

export interface WorkflowNotification {
  trigger: string;
  recipients: string[];
  template: string;
}

export interface ContentWorkflow extends BaseEntity {
  contentId: UUID;
  workflowId: UUID;
  currentStage: string;
  assignee?: UUID;
  dueDate?: Timestamp;
  history: WorkflowHistoryEntry[];
}

export interface WorkflowHistoryEntry {
  stage: string;
  userId: UUID;
  timestamp: Timestamp;
  comment?: string;
  action: string;
}

// Translation Workflow Types
export interface TranslationWorkflow {
  id: UUID;
  contentId: UUID;
  sourceLocale: Locale;
  targetLocale: Locale;
  status: TranslationStatus;
  priority: "low" | "medium" | "high";
  requestedBy: UUID;
  assignedTo?: UUID;
  deadline?: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  submittedAt?: number;
  approvedAt?: number;
  approvedBy?: UUID;
  completedAt?: number;
  rejectedAt?: number;
  rejectedBy?: UUID;
  steps: WorkflowStep[];
  actions: WorkflowAction[];
}

export interface WorkflowStep {
  id: UUID;
  type: "translate" | "review" | "approve";
  status: "pending" | "in_progress" | "completed" | "waiting";
  assignedTo?: UUID;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  comment?: string;
}

export interface WorkflowAction {
  id: UUID;
  type: "status_change" | "assignment" | "comment" | "deadline_change";
  userId: UUID;
  timestamp: number;
  comment?: string;
  data?: Record<string, unknown>;
}

// Re-export TranslationStatus for convenience
export type { TranslationStatus };
