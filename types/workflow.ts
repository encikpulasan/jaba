// Workflow Types
import type { BaseEntity, Timestamp, UUID, WorkflowStatus } from "./base.ts";

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
