// Enhanced Workflow & Collaboration Types
import type { BaseEntity, Timestamp, UUID, WorkflowStatus } from "./base.ts";
import type { Locale } from "./base.ts";
import type { TranslationStatus } from "./content.ts";

// Enhanced Workflow Status and Types
export type EnhancedWorkflowStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "rejected"
  | "published"
  | "archived"
  | "scheduled"
  | "escalated";

export type WorkflowStageType =
  | "review"
  | "approval"
  | "editing"
  | "legal_review"
  | "final_approval"
  | "publication"
  | "custom";

export type WorkflowActionType =
  | "submit"
  | "approve"
  | "reject"
  | "request_changes"
  | "reassign"
  | "escalate"
  | "publish"
  | "archive"
  | "comment"
  | "mention";

export type CollaboratorRole =
  | "reviewer"
  | "approver"
  | "editor"
  | "observer"
  | "admin";

export type NotificationType =
  | "workflow_assigned"
  | "workflow_approved"
  | "workflow_rejected"
  | "comment_added"
  | "mention"
  | "deadline_reminder"
  | "workflow_completed"
  | "conflict_detected"
  | "escalation_triggered";

// Enhanced Workflow Template
export interface WorkflowTemplate extends BaseEntity {
  name: string;
  description: string;
  stages: EnhancedWorkflowStage[];
  isDefault: boolean;
  contentTypes: string[];
  settings: WorkflowTemplateSettings;
  createdBy: UUID;
  organization?: UUID;
  isActive: boolean;
}

export interface EnhancedWorkflowStage {
  id: UUID;
  name: string;
  type: WorkflowStageType;
  description?: string;
  assignees: UUID[];
  requiredApprovals: number;
  isOptional: boolean;
  timeoutHours?: number;
  nextStages: UUID[];
  permissions: WorkflowStagePermissions;
  automationRules: WorkflowAutomationRule[];
  color: string;
}

export interface WorkflowStagePermissions {
  canEdit: boolean;
  canComment: boolean;
  canApprove: boolean;
  canReject: boolean;
  canReassign: boolean;
  canSkip: boolean;
  canViewComments: boolean;
  canAddAttachments: boolean;
}

export interface WorkflowTemplateSettings {
  allowParallelStages: boolean;
  requireAllApprovals: boolean;
  autoAssignReviewers: boolean;
  enableDeadlines: boolean;
  enableNotifications: boolean;
  enableComments: boolean;
  enableFileAttachments: boolean;
  enableRealTimeCollaboration: boolean;
  retentionDays: number;
  escalationEnabled: boolean;
}

// Enhanced Workflow Instance
export interface WorkflowInstance extends BaseEntity {
  templateId: UUID;
  contentId: UUID;
  contentType: string;
  title: string;
  currentStage: UUID;
  status: EnhancedWorkflowStatus;
  initiatedBy: UUID;
  assignedTo: UUID[];
  dueDate?: Date;
  completedAt?: Date;
  metadata: Record<string, any>;
  settings: WorkflowInstanceSettings;
  priority: "low" | "normal" | "high" | "urgent";
  tags: string[];
}

export interface WorkflowInstanceSettings {
  enableNotifications: boolean;
  enableComments: boolean;
  isPublic: boolean;
  customFields: Record<string, any>;
  allowReassignment: boolean;
  requireCommentOnReject: boolean;
}

// Enhanced Workflow Actions
export interface EnhancedWorkflowAction extends BaseEntity {
  workflowId: UUID;
  stageId: UUID;
  actionType: WorkflowActionType;
  performedBy: UUID;
  assignedTo?: UUID;
  comment?: string;
  attachments?: string[];
  metadata: Record<string, any>;
  timestamp: Date;
  isAutomated: boolean;
}

export interface WorkflowHistory {
  workflowId: UUID;
  actions: EnhancedWorkflowAction[];
  stageTransitions: WorkflowStageTransition[];
  comments: WorkflowComment[];
  assignments: WorkflowAssignment[];
}

export interface WorkflowStageTransition {
  id: UUID;
  workflowId: UUID;
  fromStage: UUID;
  toStage: UUID;
  transitionedBy: UUID;
  transitionedAt: Date;
  reason?: string;
  automaticTransition: boolean;
  conditions?: Record<string, any>;
}

// Collaboration Features
export interface WorkflowComment extends BaseEntity {
  workflowId: UUID;
  stageId?: UUID;
  authorId: UUID;
  content: string;
  mentions: UUID[];
  attachments?: string[];
  isInternal: boolean;
  parentCommentId?: UUID;
  resolvedBy?: UUID;
  resolvedAt?: Date;
  reactions: WorkflowReaction[];
  editHistory: WorkflowCommentEdit[];
}

export interface WorkflowReaction {
  userId: UUID;
  emoji: string;
  timestamp: Date;
}

export interface WorkflowCommentEdit {
  editedBy: UUID;
  editedAt: Date;
  previousContent: string;
  reason?: string;
}

export interface WorkflowAssignment extends BaseEntity {
  workflowId: UUID;
  stageId: UUID;
  assigneeId: UUID;
  assignedBy: UUID;
  assignedAt: Date;
  dueDate?: Date;
  status: "pending" | "accepted" | "completed" | "declined";
  acceptedAt?: Date;
  completedAt?: Date;
  notes?: string;
  estimatedHours?: number;
  actualHours?: number;
}

// Workflow Task Management
export interface WorkflowTask extends BaseEntity {
  workflowId: UUID;
  stageId: UUID;
  title: string;
  description?: string;
  assigneeId: UUID;
  createdBy: UUID;
  priority: "low" | "normal" | "high" | "urgent";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  dueDate?: Date;
  completedAt?: Date;
  estimatedHours?: number;
  actualHours?: number;
  tags: string[];
  checklist: WorkflowTaskItem[];
  dependencies: UUID[];
}

export interface WorkflowTaskItem {
  id: UUID;
  title: string;
  completed: boolean;
  completedBy?: UUID;
  completedAt?: Date;
  notes?: string;
}

// Real-time Collaboration
export interface WorkflowCollaboration {
  workflowId: UUID;
  activeUsers: WorkflowActiveUser[];
  locks: WorkflowLock[];
  recentActivity: WorkflowActivity[];
  conflictResolution?: WorkflowConflict[];
}

export interface WorkflowActiveUser {
  userId: UUID;
  userName: string;
  avatar?: string;
  lastSeen: Date;
  currentStage?: UUID;
  isEditing: boolean;
  cursor?: { x: number; y: number };
  status: "active" | "idle" | "away";
}

export interface WorkflowLock {
  id: UUID;
  workflowId: UUID;
  stageId?: UUID;
  lockedBy: UUID;
  lockedAt: Date;
  expiresAt: Date;
  lockType: "editing" | "reviewing" | "exclusive";
  description?: string;
}

export interface WorkflowActivity extends BaseEntity {
  workflowId: UUID;
  userId: UUID;
  userName: string;
  activityType:
    | "viewed"
    | "edited"
    | "commented"
    | "approved"
    | "assigned"
    | "mentioned";
  description: string;
  timestamp: Date;
  metadata: Record<string, any>;
  stageId?: UUID;
}

// Conflict Resolution
export interface WorkflowConflict extends BaseEntity {
  workflowId: UUID;
  stageId: UUID;
  conflictType:
    | "concurrent_edit"
    | "approval_conflict"
    | "assignment_conflict"
    | "deadline_conflict";
  description: string;
  affectedUsers: UUID[];
  detectedAt: Date;
  resolvedBy?: UUID;
  resolvedAt?: Date;
  resolution?: string;
  status: "pending" | "resolved" | "escalated";
  severity: "low" | "medium" | "high" | "critical";
}

// Workflow Automation
export interface WorkflowAutomationRule {
  id: UUID;
  name: string;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAutomationAction[];
  isActive: boolean;
  priority: number;
  description?: string;
}

export interface WorkflowTrigger {
  type:
    | "stage_entered"
    | "stage_completed"
    | "time_elapsed"
    | "deadline_approaching"
    | "user_action"
    | "content_updated";
  parameters: Record<string, any>;
  delayMinutes?: number;
}

export interface WorkflowCondition {
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "greater_than"
    | "less_than"
    | "in"
    | "not_in";
  value: any;
  logicalOperator?: "AND" | "OR";
}

export interface WorkflowAutomationAction {
  type:
    | "assign_user"
    | "send_notification"
    | "transition_stage"
    | "update_field"
    | "create_task"
    | "escalate";
  parameters: Record<string, any>;
  order: number;
}

// Enhanced Notifications
export interface EnhancedWorkflowNotification extends BaseEntity {
  workflowId: UUID;
  recipientId: UUID;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  isRead: boolean;
  readAt?: Date;
  metadata: Record<string, any>;
  priority: "low" | "normal" | "high" | "urgent";
  channels: ("email" | "in_app" | "push" | "slack")[];
  scheduledFor?: Date;
}

// Legacy interfaces (keeping for backward compatibility)
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
