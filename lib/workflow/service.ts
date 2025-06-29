// Workflow Service
// Business logic and orchestration for workflow management

import { WorkflowRepository } from "./repository.ts";
import { authService } from "@/lib/auth/service.ts";
import { contentService } from "@/lib/content/service.ts";
import type {
  EnhancedWorkflowAction,
  EnhancedWorkflowNotification,
  EnhancedWorkflowStatus,
  NotificationType,
  WorkflowActionType,
  WorkflowActiveUser,
  WorkflowActivity,
  WorkflowAssignment,
  WorkflowComment,
  WorkflowConflict,
  WorkflowInstance,
  WorkflowStageType,
  WorkflowTask,
  WorkflowTemplate,
} from "@/types/workflow.ts";
import type { UUID } from "@/types/base.ts";
import type { Permission } from "@/types/auth.ts";

export class WorkflowService {
  private repository: WorkflowRepository;
  private activeCollaborations: Map<UUID, WorkflowActiveUser[]>;

  constructor() {
    this.repository = new WorkflowRepository();
    this.activeCollaborations = new Map();
    this.startCleanupInterval();
  }

  // Workflow Template Management
  async createTemplate(
    template: Omit<WorkflowTemplate, "id" | "createdAt" | "updatedAt">,
    userId: UUID,
  ): Promise<WorkflowTemplate> {
    // Check permissions
    const hasPermission = await authService.hasPermission(
      userId,
      "create_workflow_template",
    );
    if (!hasPermission) {
      throw new Error("Insufficient permissions to create workflow template");
    }

    // Validate template
    this.validateTemplate(template);

    return await this.repository.createTemplate({
      ...template,
      createdBy: userId,
    });
  }

  async getTemplate(id: UUID, userId: UUID): Promise<WorkflowTemplate | null> {
    const template = await this.repository.getTemplate(id);
    if (!template) return null;

    // Check permissions
    const hasPermission = await authService.hasPermission(
      userId,
      "view_workflow_template",
    );
    if (!hasPermission) {
      throw new Error("Insufficient permissions to view workflow template");
    }

    return template;
  }

  async listTemplates(
    options: {
      organization?: UUID;
      contentType?: string;
      isDefault?: boolean;
      limit?: number;
    },
    userId: UUID,
  ): Promise<WorkflowTemplate[]> {
    const hasPermission = await authService.hasPermission(
      userId,
      "view_workflow_template",
    );
    if (!hasPermission) {
      throw new Error("Insufficient permissions to list workflow templates");
    }

    return await this.repository.listTemplates({
      ...options,
      isActive: true,
    });
  }

  // Workflow Instance Management
  async startWorkflow(
    templateId: UUID,
    contentId: UUID,
    contentType: string,
    title: string,
    userId: UUID,
    options: {
      priority?: "low" | "normal" | "high" | "urgent";
      dueDate?: Date;
      assignedTo?: UUID[];
      tags?: string[];
      customFields?: Record<string, any>;
    } = {},
  ): Promise<WorkflowInstance> {
    // Check permissions
    const hasPermission = await authService.hasPermission(
      userId,
      "start_workflow",
    );
    if (!hasPermission) {
      throw new Error("Insufficient permissions to start workflow");
    }

    // Get template
    const template = await this.repository.getTemplate(templateId);
    if (!template) {
      throw new Error("Workflow template not found");
    }

    // Validate content exists
    const content = await contentService.getContent(contentId, userId);
    if (!content) {
      throw new Error("Content not found");
    }

    // Create workflow instance
    const instance = await this.repository.createInstance({
      templateId,
      contentId,
      contentType,
      title,
      currentStage: template.stages[0].id,
      status: "draft",
      initiatedBy: userId,
      assignedTo: options.assignedTo || [],
      dueDate: options.dueDate,
      metadata: {},
      settings: {
        enableNotifications: template.settings.enableNotifications,
        enableComments: template.settings.enableComments,
        isPublic: false,
        customFields: options.customFields || {},
        allowReassignment: true,
        requireCommentOnReject: false,
      },
      priority: options.priority || "normal",
      tags: options.tags || [],
    });

    // Create initial action
    await this.addAction({
      workflowId: instance.id,
      stageId: instance.currentStage,
      actionType: "submit",
      performedBy: userId,
      comment: "Workflow initiated",
      timestamp: new Date(),
      isAutomated: false,
    });

    // Auto-assign reviewers if enabled
    if (template.settings.autoAssignReviewers) {
      await this.autoAssignReviewers(instance.id, template.stages[0]);
    }

    // Send notifications
    await this.notifyWorkflowStarted(instance);

    console.log(`🚀 Started workflow: ${title}`);
    return instance;
  }

  async transitionWorkflow(
    workflowId: UUID,
    fromStage: UUID,
    toStage: UUID,
    actionType: WorkflowActionType,
    userId: UUID,
    options: {
      comment?: string;
      attachments?: string[];
      assignTo?: UUID[];
    } = {},
  ): Promise<WorkflowInstance> {
    // Get workflow instance
    const instance = await this.repository.getInstance(workflowId);
    if (!instance) {
      throw new Error("Workflow not found");
    }

    // Check permissions
    const hasPermission = await this.checkStagePermission(
      instance,
      fromStage,
      actionType,
      userId,
    );
    if (!hasPermission) {
      throw new Error("Insufficient permissions for this workflow action");
    }

    // Get template and stages
    const template = await this.repository.getTemplate(instance.templateId);
    if (!template) {
      throw new Error("Workflow template not found");
    }

    const currentStage = template.stages.find((s) => s.id === fromStage);
    const nextStage = template.stages.find((s) => s.id === toStage);

    if (!currentStage || !nextStage) {
      throw new Error("Invalid stage transition");
    }

    // Validate transition
    if (!currentStage.nextStages.includes(toStage)) {
      throw new Error("Invalid stage transition");
    }

    // Update workflow instance
    const newStatus = this.determineWorkflowStatus(actionType, nextStage);
    const updatedInstance = await this.repository.updateInstance(workflowId, {
      currentStage: toStage,
      status: newStatus,
      assignedTo: options.assignTo || nextStage.assignees,
      ...(newStatus === "completed" && { completedAt: new Date() }),
    });

    if (!updatedInstance) {
      throw new Error("Failed to update workflow instance");
    }

    // Record action
    await this.addAction({
      workflowId,
      stageId: toStage,
      actionType,
      performedBy: userId,
      comment: options.comment,
      attachments: options.attachments,
      timestamp: new Date(),
      isAutomated: false,
    });

    // Record activity
    await this.addActivity({
      workflowId,
      userId,
      userName: await this.getUserName(userId),
      activityType: this.mapActionToActivity(actionType),
      description: `${
        actionType.replace("_", " ")
      } - ${currentStage.name} → ${nextStage.name}`,
      timestamp: new Date(),
      metadata: { fromStage, toStage, actionType },
      stageId: toStage,
    });

    // Handle stage-specific logic
    await this.handleStageTransition(
      updatedInstance,
      currentStage,
      nextStage,
      userId,
    );

    // Send notifications
    await this.notifyWorkflowTransition(
      updatedInstance,
      actionType,
      userId,
      options.comment,
    );

    // Check for automation rules
    await this.processAutomationRules(updatedInstance, nextStage);

    console.log(
      `✅ Transitioned workflow ${workflowId}: ${currentStage.name} → ${nextStage.name}`,
    );
    return updatedInstance;
  }

  async assignWorkflow(
    workflowId: UUID,
    stageId: UUID,
    assigneeId: UUID,
    assignedBy: UUID,
    options: {
      dueDate?: Date;
      notes?: string;
      estimatedHours?: number;
    } = {},
  ): Promise<WorkflowAssignment> {
    // Check permissions
    const hasPermission = await authService.hasPermission(
      assignedBy,
      "assign_workflow",
    );
    if (!hasPermission) {
      throw new Error("Insufficient permissions to assign workflow");
    }

    // Validate assignee exists and has permissions
    const assigneeUser = await authService.getUserById(assigneeId);
    if (!assigneeUser) {
      throw new Error("Assignee not found");
    }

    const assignment = await this.repository.createAssignment({
      workflowId,
      stageId,
      assigneeId,
      assignedBy,
      assignedAt: new Date(),
      dueDate: options.dueDate,
      status: "pending",
      notes: options.notes,
      estimatedHours: options.estimatedHours,
    });

    // Send notification
    await this.notifyAssignment(assignment);

    // Record activity
    await this.addActivity({
      workflowId,
      userId: assignedBy,
      userName: await this.getUserName(assignedBy),
      activityType: "assigned",
      description: `Assigned to ${assigneeUser.name}`,
      timestamp: new Date(),
      metadata: { assigneeId, stageId },
      stageId,
    });

    return assignment;
  }

  // Comments and Collaboration
  async addComment(
    workflowId: UUID,
    authorId: UUID,
    content: string,
    options: {
      stageId?: UUID;
      mentions?: UUID[];
      attachments?: string[];
      isInternal?: boolean;
      parentCommentId?: UUID;
    } = {},
  ): Promise<WorkflowComment> {
    // Check permissions
    const instance = await this.repository.getInstance(workflowId);
    if (!instance) {
      throw new Error("Workflow not found");
    }

    const hasPermission = await this.checkCommentPermission(instance, authorId);
    if (!hasPermission) {
      throw new Error("Insufficient permissions to comment on workflow");
    }

    const comment = await this.repository.addComment({
      workflowId,
      stageId: options.stageId,
      authorId,
      content,
      mentions: options.mentions || [],
      attachments: options.attachments,
      isInternal: options.isInternal || false,
      parentCommentId: options.parentCommentId,
    });

    // Send notifications for mentions
    if (options.mentions && options.mentions.length > 0) {
      await this.notifyMentions(
        workflowId,
        authorId,
        options.mentions,
        content,
      );
    }

    // Record activity
    await this.addActivity({
      workflowId,
      userId: authorId,
      userName: await this.getUserName(authorId),
      activityType: "commented",
      description: `Added comment: ${content.substring(0, 50)}${
        content.length > 50 ? "..." : ""
      }`,
      timestamp: new Date(),
      metadata: { commentId: comment.id },
      stageId: options.stageId,
    });

    return comment;
  }

  async getWorkflowComments(
    workflowId: UUID,
    userId: UUID,
  ): Promise<WorkflowComment[]> {
    // Check permissions
    const instance = await this.repository.getInstance(workflowId);
    if (!instance) {
      throw new Error("Workflow not found");
    }

    const hasPermission = await this.checkViewPermission(instance, userId);
    if (!hasPermission) {
      throw new Error("Insufficient permissions to view workflow comments");
    }

    const comments = await this.repository.getWorkflowComments(workflowId);

    // Filter internal comments if user doesn't have permission
    const canViewInternal = await authService.hasPermission(
      userId,
      "view_internal_comments",
    );
    return comments.filter((comment) => !comment.isInternal || canViewInternal);
  }

  // Real-time Collaboration
  async joinWorkflow(workflowId: UUID, userId: UUID): Promise<void> {
    const instance = await this.repository.getInstance(workflowId);
    if (!instance) {
      throw new Error("Workflow not found");
    }

    const hasPermission = await this.checkViewPermission(instance, userId);
    if (!hasPermission) {
      throw new Error("Insufficient permissions to view workflow");
    }

    const user = await authService.getUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const activeUser: WorkflowActiveUser = {
      userId,
      userName: user.name,
      avatar: user.profile?.avatar,
      lastSeen: new Date(),
      isEditing: false,
      status: "active",
    };

    let activeUsers = this.activeCollaborations.get(workflowId) || [];

    // Remove existing entry for this user
    activeUsers = activeUsers.filter((u) => u.userId !== userId);

    // Add updated user
    activeUsers.push(activeUser);

    this.activeCollaborations.set(workflowId, activeUsers);
    await this.repository.updateActiveUsers(workflowId, activeUsers);

    // Record activity
    await this.addActivity({
      workflowId,
      userId,
      userName: user.name,
      activityType: "viewed",
      description: "Joined workflow",
      timestamp: new Date(),
      metadata: {},
    });
  }

  async leaveWorkflow(workflowId: UUID, userId: UUID): Promise<void> {
    let activeUsers = this.activeCollaborations.get(workflowId) || [];
    activeUsers = activeUsers.filter((u) => u.userId !== userId);

    this.activeCollaborations.set(workflowId, activeUsers);
    await this.repository.updateActiveUsers(workflowId, activeUsers);
  }

  async updateUserStatus(
    workflowId: UUID,
    userId: UUID,
    status: "active" | "idle" | "away",
    isEditing = false,
    cursor?: { x: number; y: number },
  ): Promise<void> {
    let activeUsers = this.activeCollaborations.get(workflowId) || [];
    const userIndex = activeUsers.findIndex((u) => u.userId === userId);

    if (userIndex >= 0) {
      activeUsers[userIndex] = {
        ...activeUsers[userIndex],
        lastSeen: new Date(),
        status,
        isEditing,
        cursor,
      };

      this.activeCollaborations.set(workflowId, activeUsers);
      await this.repository.updateActiveUsers(workflowId, activeUsers);
    }
  }

  // Task Management
  async createTask(
    workflowId: UUID,
    stageId: UUID,
    task: {
      title: string;
      description?: string;
      assigneeId: UUID;
      priority?: "low" | "normal" | "high" | "urgent";
      dueDate?: Date;
      estimatedHours?: number;
      tags?: string[];
      checklist?: Array<{ title: string }>;
    },
    createdBy: UUID,
  ): Promise<WorkflowTask> {
    // Check permissions
    const hasPermission = await authService.hasPermission(
      createdBy,
      "create_workflow_task",
    );
    if (!hasPermission) {
      throw new Error("Insufficient permissions to create workflow task");
    }

    const workflowTask = await this.repository.createTask({
      workflowId,
      stageId,
      title: task.title,
      description: task.description,
      assigneeId: task.assigneeId,
      createdBy,
      priority: task.priority || "normal",
      status: "pending",
      dueDate: task.dueDate,
      estimatedHours: task.estimatedHours,
      tags: task.tags || [],
      checklist: (task.checklist || []).map((item) => ({
        id: crypto.randomUUID(),
        title: item.title,
        completed: false,
      })),
      dependencies: [],
    });

    // Send notification to assignee
    await this.notifyTaskAssignment(workflowTask);

    return workflowTask;
  }

  // Analytics and Reporting
  async getWorkflowAnalytics(
    userId: UUID,
    options: {
      templateId?: UUID;
      dateRange?: { start: Date; end: Date };
      includeTeamMetrics?: boolean;
    } = {},
  ): Promise<any> {
    const hasPermission = await authService.hasPermission(
      userId,
      "view_workflow_analytics",
    );
    if (!hasPermission) {
      throw new Error("Insufficient permissions to view workflow analytics");
    }

    const analytics = await this.repository.getWorkflowAnalytics(
      options.templateId,
      options.dateRange,
    );

    // Add additional metrics
    const extendedAnalytics = {
      ...analytics,
      efficiency: analytics.totalWorkflows > 0
        ? (analytics.completedWorkflows / analytics.totalWorkflows) * 100
        : 0,
      averageCompletionDays: analytics.averageCompletionTime / 24,
    };

    return extendedAnalytics;
  }

  // Private helper methods
  private validateTemplate(
    template: Omit<WorkflowTemplate, "id" | "createdAt" | "updatedAt">,
  ): void {
    if (!template.name || template.name.trim().length === 0) {
      throw new Error("Template name is required");
    }

    if (!template.stages || template.stages.length === 0) {
      throw new Error("Template must have at least one stage");
    }

    // Validate stage connectivity
    const stageIds = new Set(template.stages.map((s) => s.id));
    for (const stage of template.stages) {
      for (const nextStageId of stage.nextStages) {
        if (!stageIds.has(nextStageId)) {
          throw new Error(
            `Stage ${stage.name} references non-existent next stage`,
          );
        }
      }
    }
  }

  private async checkStagePermission(
    instance: WorkflowInstance,
    stageId: UUID,
    actionType: WorkflowActionType,
    userId: UUID,
  ): Promise<boolean> {
    // Get template and stage
    const template = await this.repository.getTemplate(instance.templateId);
    if (!template) return false;

    const stage = template.stages.find((s) => s.id === stageId);
    if (!stage) return false;

    // Check if user is assigned to this stage
    if (
      !stage.assignees.includes(userId) && !instance.assignedTo.includes(userId)
    ) {
      // Check if user has admin permissions
      const isAdmin = await authService.hasPermission(userId, "admin_workflow");
      if (!isAdmin) return false;
    }

    // Check action-specific permissions
    switch (actionType) {
      case "approve":
        return stage.permissions.canApprove;
      case "reject":
        return stage.permissions.canReject;
      case "request_changes":
        return stage.permissions.canEdit;
      case "reassign":
        return stage.permissions.canReassign;
      default:
        return true;
    }
  }

  private async checkCommentPermission(
    instance: WorkflowInstance,
    userId: UUID,
  ): Promise<boolean> {
    // Check if comments are enabled
    if (!instance.settings.enableComments) return false;

    // Check if user is involved in workflow
    if (
      instance.assignedTo.includes(userId) || instance.initiatedBy === userId
    ) {
      return true;
    }

    // Check general permission
    return await authService.hasPermission(userId, "comment_workflow");
  }

  private async checkViewPermission(
    instance: WorkflowInstance,
    userId: UUID,
  ): Promise<boolean> {
    // Public workflows can be viewed by anyone with general permission
    if (instance.settings.isPublic) {
      return await authService.hasPermission(userId, "view_workflow");
    }

    // Check if user is involved in workflow
    if (
      instance.assignedTo.includes(userId) || instance.initiatedBy === userId
    ) {
      return true;
    }

    // Check admin permission
    return await authService.hasPermission(userId, "admin_workflow");
  }

  private determineWorkflowStatus(
    actionType: WorkflowActionType,
    stage: any,
  ): EnhancedWorkflowStatus {
    switch (actionType) {
      case "approve":
        return stage.type === "publication" ? "published" : "approved";
      case "reject":
        return "rejected";
      case "publish":
        return "published";
      case "archive":
        return "archived";
      default:
        return "in_review";
    }
  }

  private mapActionToActivity(actionType: WorkflowActionType): string {
    const mapping: Record<WorkflowActionType, string> = {
      submit: "edited",
      approve: "approved",
      reject: "edited",
      request_changes: "edited",
      reassign: "assigned",
      escalate: "edited",
      publish: "edited",
      archive: "edited",
      comment: "commented",
      mention: "mentioned",
    };
    return mapping[actionType] || "edited";
  }

  private async addAction(
    action: Omit<EnhancedWorkflowAction, "id" | "createdAt" | "updatedAt">,
  ): Promise<EnhancedWorkflowAction> {
    return await this.repository.addAction(action);
  }

  private async addActivity(
    activity: Omit<WorkflowActivity, "id" | "createdAt" | "updatedAt">,
  ): Promise<WorkflowActivity> {
    return await this.repository.addActivity(activity);
  }

  private async getUserName(userId: UUID): Promise<string> {
    const user = await authService.getUserById(userId);
    return user?.name || "Unknown User";
  }

  private async autoAssignReviewers(
    workflowId: UUID,
    stage: any,
  ): Promise<void> {
    for (const assigneeId of stage.assignees) {
      await this.repository.createAssignment({
        workflowId,
        stageId: stage.id,
        assigneeId,
        assignedBy: "system" as UUID, // System assignment
        assignedAt: new Date(),
        status: "pending",
      });
    }
  }

  private async handleStageTransition(
    instance: WorkflowInstance,
    fromStage: any,
    toStage: any,
    userId: UUID,
  ): Promise<void> {
    // Handle stage-specific logic
    if (toStage.type === "publication" && instance.status === "published") {
      // Trigger content publication
      await contentService.publishContent(instance.contentId, userId);
    }

    // Check for stage timeout and set reminders
    if (toStage.timeoutHours) {
      // Schedule timeout reminder (would integrate with a job scheduler)
      console.log(
        `⏰ Scheduled timeout reminder for stage ${toStage.name} in ${toStage.timeoutHours} hours`,
      );
    }
  }

  private async processAutomationRules(
    instance: WorkflowInstance,
    stage: any,
  ): Promise<void> {
    for (const rule of stage.automationRules || []) {
      if (!rule.isActive) continue;

      // Process automation rule (simplified)
      console.log(`🤖 Processing automation rule: ${rule.name}`);

      // This would be expanded with actual automation logic
      for (const action of rule.actions) {
        switch (action.type) {
          case "send_notification":
            // Send automated notification
            break;
          case "assign_user":
            // Auto-assign user
            break;
          case "transition_stage":
            // Auto-transition to next stage
            break;
        }
      }
    }
  }

  // Notification methods
  private async notifyWorkflowStarted(
    instance: WorkflowInstance,
  ): Promise<void> {
    for (const assigneeId of instance.assignedTo) {
      await this.repository.createNotification({
        workflowId: instance.id,
        recipientId: assigneeId,
        type: "workflow_assigned",
        title: "New Workflow Assignment",
        message: `You have been assigned to workflow: ${instance.title}`,
        actionUrl: `/workflows/${instance.id}`,
        isRead: false,
        metadata: { workflowId: instance.id },
        priority: instance.priority,
        channels: ["in_app", "email"],
      });
    }
  }

  private async notifyWorkflowTransition(
    instance: WorkflowInstance,
    actionType: WorkflowActionType,
    performedBy: UUID,
    comment?: string,
  ): Promise<void> {
    const performer = await this.getUserName(performedBy);

    for (const assigneeId of instance.assignedTo) {
      if (assigneeId === performedBy) continue; // Don't notify the performer

      await this.repository.createNotification({
        workflowId: instance.id,
        recipientId: assigneeId,
        type: actionType === "approve"
          ? "workflow_approved"
          : "workflow_rejected",
        title: `Workflow ${actionType}`,
        message: `${performer} ${actionType}d workflow: ${instance.title}${
          comment ? ` - ${comment}` : ""
        }`,
        actionUrl: `/workflows/${instance.id}`,
        isRead: false,
        metadata: { workflowId: instance.id, actionType, performedBy },
        priority: instance.priority,
        channels: ["in_app"],
      });
    }
  }

  private async notifyAssignment(
    assignment: WorkflowAssignment,
  ): Promise<void> {
    const assigner = await this.getUserName(assignment.assignedBy);

    await this.repository.createNotification({
      workflowId: assignment.workflowId,
      recipientId: assignment.assigneeId,
      type: "workflow_assigned",
      title: "Workflow Assignment",
      message: `${assigner} assigned you to a workflow task`,
      actionUrl: `/workflows/${assignment.workflowId}`,
      isRead: false,
      metadata: { assignmentId: assignment.id },
      priority: "normal",
      channels: ["in_app", "email"],
    });
  }

  private async notifyMentions(
    workflowId: UUID,
    authorId: UUID,
    mentions: UUID[],
    content: string,
  ): Promise<void> {
    const author = await this.getUserName(authorId);

    for (const mentionedUserId of mentions) {
      await this.repository.createNotification({
        workflowId,
        recipientId: mentionedUserId,
        type: "mention",
        title: "You were mentioned",
        message: `${author} mentioned you: ${content.substring(0, 100)}${
          content.length > 100 ? "..." : ""
        }`,
        actionUrl: `/workflows/${workflowId}`,
        isRead: false,
        metadata: { authorId, mentionContext: content },
        priority: "normal",
        channels: ["in_app"],
      });
    }
  }

  private async notifyTaskAssignment(task: WorkflowTask): Promise<void> {
    const creator = await this.getUserName(task.createdBy);

    await this.repository.createNotification({
      workflowId: task.workflowId,
      recipientId: task.assigneeId,
      type: "workflow_assigned",
      title: "New Task Assignment",
      message: `${creator} assigned you a task: ${task.title}`,
      actionUrl: `/workflows/${task.workflowId}/tasks/${task.id}`,
      isRead: false,
      metadata: { taskId: task.id },
      priority: task.priority,
      channels: ["in_app"],
    });
  }

  private startCleanupInterval(): void {
    // Clean up stale active users every 5 minutes
    setInterval(async () => {
      for (
        const [workflowId, activeUsers] of this.activeCollaborations.entries()
      ) {
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        const activeUsers_filtered = activeUsers.filter(
          (user) => user.lastSeen.getTime() > fiveMinutesAgo,
        );

        if (activeUsers_filtered.length !== activeUsers.length) {
          this.activeCollaborations.set(workflowId, activeUsers_filtered);
          await this.repository.updateActiveUsers(
            workflowId,
            activeUsers_filtered,
          );
        }
      }
    }, 5 * 60 * 1000); // 5 minutes
  }
}

// Export singleton instance
export const workflowService = new WorkflowService();
