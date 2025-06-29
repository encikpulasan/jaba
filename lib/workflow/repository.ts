// Workflow Repository
// Comprehensive workflow and collaboration data management

import { BaseRepository } from "@/lib/db/repositories/base.ts";
import { DbPatterns } from "@/lib/db/patterns.ts";
import type {
  EnhancedWorkflowAction,
  EnhancedWorkflowNotification,
  EnhancedWorkflowStatus,
  NotificationType,
  WorkflowActionType,
  WorkflowActiveUser,
  WorkflowActivity,
  WorkflowAssignment,
  WorkflowCollaboration,
  WorkflowComment,
  WorkflowConflict,
  WorkflowInstance,
  WorkflowLock,
  WorkflowStageType,
  WorkflowTask,
  WorkflowTemplate,
} from "@/types/workflow.ts";
import type { UUID } from "@/types/base.ts";

export class WorkflowRepository extends BaseRepository {
  // Workflow Template Management
  async createTemplate(
    template: Omit<WorkflowTemplate, "id" | "createdAt" | "updatedAt">,
  ): Promise<WorkflowTemplate> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const fullTemplate: WorkflowTemplate = {
      ...template,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.kv.set(DbPatterns.workflow.template(id), fullTemplate);

    // Index by organization and creator
    if (template.organization) {
      await this.kv.set(
        DbPatterns.workflow.templateByOrganization(template.organization, id),
        id,
      );
    }
    await this.kv.set(
      DbPatterns.workflow.templateByCreator(template.createdBy, id),
      id,
    );

    // Index default templates
    if (template.isDefault) {
      await this.kv.set(DbPatterns.workflow.defaultTemplate(id), id);
    }

    console.log(`✅ Created workflow template: ${template.name}`);
    return fullTemplate;
  }

  async getTemplate(id: UUID): Promise<WorkflowTemplate | null> {
    const result = await this.kv.get(DbPatterns.workflow.template(id));
    return result.value as WorkflowTemplate | null;
  }

  async updateTemplate(
    id: UUID,
    updates: Partial<WorkflowTemplate>,
  ): Promise<WorkflowTemplate | null> {
    const existing = await this.getTemplate(id);
    if (!existing) return null;

    const updated: WorkflowTemplate = {
      ...existing,
      ...updates,
      id,
      updatedAt: Date.now(),
    };

    await this.kv.set(DbPatterns.workflow.template(id), updated);
    console.log(`✅ Updated workflow template: ${id}`);
    return updated;
  }

  async listTemplates(options: {
    organization?: UUID;
    createdBy?: UUID;
    contentType?: string;
    isDefault?: boolean;
    isActive?: boolean;
    limit?: number;
  } = {}): Promise<WorkflowTemplate[]> {
    const templates: WorkflowTemplate[] = [];

    let iterator;
    if (options.organization) {
      iterator = this.kv.list({
        prefix: [
          DbPatterns.workflow.templateByOrganization(options.organization, ""),
        ],
      });
    } else if (options.createdBy) {
      iterator = this.kv.list({
        prefix: [DbPatterns.workflow.templateByCreator(options.createdBy, "")],
      });
    } else if (options.isDefault) {
      iterator = this.kv.list({
        prefix: [DbPatterns.workflow.defaultTemplate("")],
      });
    } else {
      iterator = this.kv.list({ prefix: ["workflow", "template"] });
    }

    for await (const entry of iterator) {
      const template = entry.value as WorkflowTemplate;

      // Apply filters
      if (
        options.contentType &&
        !template.contentTypes.includes(options.contentType)
      ) continue;
      if (
        options.isActive !== undefined && template.isActive !== options.isActive
      ) continue;

      templates.push(template);

      if (options.limit && templates.length >= options.limit) break;
    }

    return templates.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Workflow Instance Management
  async createInstance(
    instance: Omit<WorkflowInstance, "id" | "createdAt" | "updatedAt">,
  ): Promise<WorkflowInstance> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const fullInstance: WorkflowInstance = {
      ...instance,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.kv.set(DbPatterns.workflow.instance(id), fullInstance);

    // Index by various criteria
    await this.kv.set(
      DbPatterns.workflow.instanceByContent(instance.contentId, id),
      id,
    );
    await this.kv.set(
      DbPatterns.workflow.instanceByTemplate(instance.templateId, id),
      id,
    );
    await this.kv.set(
      DbPatterns.workflow.instanceByInitiator(instance.initiatedBy, id),
      id,
    );
    await this.kv.set(
      DbPatterns.workflow.instanceByStatus(instance.status, id),
      id,
    );

    // Index by assignees
    for (const assigneeId of instance.assignedTo) {
      await this.kv.set(
        DbPatterns.workflow.instanceByAssignee(assigneeId, id),
        id,
      );
    }

    console.log(`✅ Created workflow instance: ${instance.title}`);
    return fullInstance;
  }

  async getInstance(id: UUID): Promise<WorkflowInstance | null> {
    const result = await this.kv.get(DbPatterns.workflow.instance(id));
    return result.value as WorkflowInstance | null;
  }

  async updateInstance(
    id: UUID,
    updates: Partial<WorkflowInstance>,
  ): Promise<WorkflowInstance | null> {
    const existing = await this.getInstance(id);
    if (!existing) return null;

    const updated: WorkflowInstance = {
      ...existing,
      ...updates,
      id,
      updatedAt: Date.now(),
    };

    await this.kv.set(DbPatterns.workflow.instance(id), updated);

    // Update status index if status changed
    if (updates.status && updates.status !== existing.status) {
      await this.kv.delete(
        DbPatterns.workflow.instanceByStatus(existing.status, id),
      );
      await this.kv.set(
        DbPatterns.workflow.instanceByStatus(updates.status, id),
        id,
      );
    }

    console.log(`✅ Updated workflow instance: ${id}`);
    return updated;
  }

  async listInstances(options: {
    contentId?: UUID;
    templateId?: UUID;
    assigneeId?: UUID;
    initiatedBy?: UUID;
    status?: EnhancedWorkflowStatus;
    priority?: string;
    isOverdue?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ instances: WorkflowInstance[]; total: number }> {
    const instances: WorkflowInstance[] = [];

    let iterator;
    if (options.contentId) {
      iterator = this.kv.list({
        prefix: [DbPatterns.workflow.instanceByContent(options.contentId, "")],
      });
    } else if (options.templateId) {
      iterator = this.kv.list({
        prefix: [
          DbPatterns.workflow.instanceByTemplate(options.templateId, ""),
        ],
      });
    } else if (options.assigneeId) {
      iterator = this.kv.list({
        prefix: [
          DbPatterns.workflow.instanceByAssignee(options.assigneeId, ""),
        ],
      });
    } else if (options.status) {
      iterator = this.kv.list({
        prefix: [DbPatterns.workflow.instanceByStatus(options.status, "")],
      });
    } else {
      iterator = this.kv.list({ prefix: ["workflow", "instance"] });
    }

    const allInstances: WorkflowInstance[] = [];
    for await (const entry of iterator) {
      if (entry.key.length === 3) { // Direct instance entries
        allInstances.push(entry.value as WorkflowInstance);
      } else {
        // Index entries, get the actual instance
        const instanceId = entry.value as UUID;
        const instance = await this.getInstance(instanceId);
        if (instance) allInstances.push(instance);
      }
    }

    // Apply additional filters
    const filteredInstances = allInstances.filter((instance) => {
      if (options.priority && instance.priority !== options.priority) {
        return false;
      }
      if (
        options.isOverdue && instance.dueDate &&
        new Date(instance.dueDate) > new Date()
      ) return false;
      return true;
    });

    // Sort by creation date (newest first)
    filteredInstances.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 20;
    const paginatedInstances = filteredInstances.slice(offset, offset + limit);

    return {
      instances: paginatedInstances,
      total: filteredInstances.length,
    };
  }

  // Workflow Actions
  async addAction(
    action: Omit<EnhancedWorkflowAction, "id" | "createdAt" | "updatedAt">,
  ): Promise<EnhancedWorkflowAction> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const fullAction: EnhancedWorkflowAction = {
      ...action,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.kv.set(DbPatterns.workflow.action(id), fullAction);
    await this.kv.set(
      DbPatterns.workflow.actionByWorkflow(action.workflowId, id),
      id,
    );
    await this.kv.set(
      DbPatterns.workflow.actionByUser(action.performedBy, id),
      id,
    );

    console.log(`✅ Added workflow action: ${action.actionType}`);
    return fullAction;
  }

  async getWorkflowActions(
    workflowId: UUID,
  ): Promise<EnhancedWorkflowAction[]> {
    const actions: EnhancedWorkflowAction[] = [];
    const iterator = this.kv.list({
      prefix: [DbPatterns.workflow.actionByWorkflow(workflowId, "")],
    });

    for await (const entry of iterator) {
      const actionId = entry.value as UUID;
      const action = await this.kv.get(DbPatterns.workflow.action(actionId));
      if (action.value) {
        actions.push(action.value as EnhancedWorkflowAction);
      }
    }

    return actions.sort((a, b) =>
      a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  // Workflow Comments
  async addComment(
    comment: Omit<WorkflowComment, "id" | "createdAt" | "updatedAt">,
  ): Promise<WorkflowComment> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const fullComment: WorkflowComment = {
      ...comment,
      id,
      createdAt: now,
      updatedAt: now,
      reactions: [],
      editHistory: [],
    };

    await this.kv.set(DbPatterns.workflow.comment(id), fullComment);
    await this.kv.set(
      DbPatterns.workflow.commentByWorkflow(comment.workflowId, id),
      id,
    );

    // Index mentions
    for (const mentionedUserId of comment.mentions) {
      await this.kv.set(
        DbPatterns.workflow.commentByMention(mentionedUserId, id),
        id,
      );
    }

    console.log(`✅ Added workflow comment by user: ${comment.authorId}`);
    return fullComment;
  }

  async getWorkflowComments(workflowId: UUID): Promise<WorkflowComment[]> {
    const comments: WorkflowComment[] = [];
    const iterator = this.kv.list({
      prefix: [DbPatterns.workflow.commentByWorkflow(workflowId, "")],
    });

    for await (const entry of iterator) {
      const commentId = entry.value as UUID;
      const comment = await this.kv.get(DbPatterns.workflow.comment(commentId));
      if (comment.value) {
        comments.push(comment.value as WorkflowComment);
      }
    }

    return comments.sort((a, b) => a.createdAt - b.createdAt);
  }

  async updateComment(
    id: UUID,
    updates: Partial<WorkflowComment>,
  ): Promise<WorkflowComment | null> {
    const existing = await this.kv.get(DbPatterns.workflow.comment(id));
    if (!existing.value) return null;

    const comment = existing.value as WorkflowComment;
    const updated: WorkflowComment = {
      ...comment,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.kv.set(DbPatterns.workflow.comment(id), updated);
    return updated;
  }

  // Workflow Assignments
  async createAssignment(
    assignment: Omit<WorkflowAssignment, "id" | "createdAt" | "updatedAt">,
  ): Promise<WorkflowAssignment> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const fullAssignment: WorkflowAssignment = {
      ...assignment,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.kv.set(DbPatterns.workflow.assignment(id), fullAssignment);
    await this.kv.set(
      DbPatterns.workflow.assignmentByWorkflow(assignment.workflowId, id),
      id,
    );
    await this.kv.set(
      DbPatterns.workflow.assignmentByAssignee(assignment.assigneeId, id),
      id,
    );

    console.log(
      `✅ Created workflow assignment for user: ${assignment.assigneeId}`,
    );
    return fullAssignment;
  }

  async updateAssignment(
    id: UUID,
    updates: Partial<WorkflowAssignment>,
  ): Promise<WorkflowAssignment | null> {
    const existing = await this.kv.get(DbPatterns.workflow.assignment(id));
    if (!existing.value) return null;

    const assignment = existing.value as WorkflowAssignment;
    const updated: WorkflowAssignment = {
      ...assignment,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.kv.set(DbPatterns.workflow.assignment(id), updated);
    return updated;
  }

  async getUserAssignments(
    userId: UUID,
    status?: string,
  ): Promise<WorkflowAssignment[]> {
    const assignments: WorkflowAssignment[] = [];
    const iterator = this.kv.list({
      prefix: [DbPatterns.workflow.assignmentByAssignee(userId, "")],
    });

    for await (const entry of iterator) {
      const assignmentId = entry.value as UUID;
      const assignment = await this.kv.get(
        DbPatterns.workflow.assignment(assignmentId),
      );
      if (assignment.value) {
        const assignmentData = assignment.value as WorkflowAssignment;
        if (!status || assignmentData.status === status) {
          assignments.push(assignmentData);
        }
      }
    }

    return assignments.sort((a, b) =>
      a.assignedAt.getTime() - b.assignedAt.getTime()
    );
  }

  // Workflow Tasks
  async createTask(
    task: Omit<WorkflowTask, "id" | "createdAt" | "updatedAt">,
  ): Promise<WorkflowTask> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const fullTask: WorkflowTask = {
      ...task,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.kv.set(DbPatterns.workflow.task(id), fullTask);
    await this.kv.set(
      DbPatterns.workflow.taskByWorkflow(task.workflowId, id),
      id,
    );
    await this.kv.set(
      DbPatterns.workflow.taskByAssignee(task.assigneeId, id),
      id,
    );

    console.log(`✅ Created workflow task: ${task.title}`);
    return fullTask;
  }

  async updateTask(
    id: UUID,
    updates: Partial<WorkflowTask>,
  ): Promise<WorkflowTask | null> {
    const existing = await this.kv.get(DbPatterns.workflow.task(id));
    if (!existing.value) return null;

    const task = existing.value as WorkflowTask;
    const updated: WorkflowTask = {
      ...task,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.kv.set(DbPatterns.workflow.task(id), updated);
    return updated;
  }

  async getWorkflowTasks(workflowId: UUID): Promise<WorkflowTask[]> {
    const tasks: WorkflowTask[] = [];
    const iterator = this.kv.list({
      prefix: [DbPatterns.workflow.taskByWorkflow(workflowId, "")],
    });

    for await (const entry of iterator) {
      const taskId = entry.value as UUID;
      const task = await this.kv.get(DbPatterns.workflow.task(taskId));
      if (task.value) {
        tasks.push(task.value as WorkflowTask);
      }
    }

    return tasks.sort((a, b) => a.createdAt - b.createdAt);
  }

  // Real-time Collaboration
  async updateActiveUsers(
    workflowId: UUID,
    activeUsers: WorkflowActiveUser[],
  ): Promise<void> {
    await this.kv.set(DbPatterns.workflow.activeUsers(workflowId), {
      workflowId,
      users: activeUsers,
      lastUpdated: Date.now(),
    });
  }

  async getActiveUsers(workflowId: UUID): Promise<WorkflowActiveUser[]> {
    const result = await this.kv.get(
      DbPatterns.workflow.activeUsers(workflowId),
    );
    if (!result.value) return [];

    const data = result.value as {
      users: WorkflowActiveUser[];
      lastUpdated: number;
    };

    // Filter out stale users (inactive for more than 5 minutes)
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    return data.users.filter((user) =>
      user.lastSeen.getTime() > fiveMinutesAgo
    );
  }

  async addActivity(
    activity: Omit<WorkflowActivity, "id" | "createdAt" | "updatedAt">,
  ): Promise<WorkflowActivity> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const fullActivity: WorkflowActivity = {
      ...activity,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.kv.set(DbPatterns.workflow.activity(id), fullActivity);
    await this.kv.set(
      DbPatterns.workflow.activityByWorkflow(activity.workflowId, id),
      id,
    );

    // Keep only recent activities (last 100)
    const activities = await this.getWorkflowActivities(activity.workflowId);
    if (activities.length > 100) {
      const oldActivities = activities.slice(100);
      for (const oldActivity of oldActivities) {
        await this.kv.delete(DbPatterns.workflow.activity(oldActivity.id));
        await this.kv.delete(
          DbPatterns.workflow.activityByWorkflow(
            activity.workflowId,
            oldActivity.id,
          ),
        );
      }
    }

    return fullActivity;
  }

  async getWorkflowActivities(
    workflowId: UUID,
    limit = 50,
  ): Promise<WorkflowActivity[]> {
    const activities: WorkflowActivity[] = [];
    const iterator = this.kv.list({
      prefix: [DbPatterns.workflow.activityByWorkflow(workflowId, "")],
    });

    for await (const entry of iterator) {
      const activityId = entry.value as UUID;
      const activity = await this.kv.get(
        DbPatterns.workflow.activity(activityId),
      );
      if (activity.value) {
        activities.push(activity.value as WorkflowActivity);
      }
    }

    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // Notifications
  async createNotification(
    notification: Omit<
      EnhancedWorkflowNotification,
      "id" | "createdAt" | "updatedAt"
    >,
  ): Promise<EnhancedWorkflowNotification> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const fullNotification: EnhancedWorkflowNotification = {
      ...notification,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.kv.set(DbPatterns.workflow.notification(id), fullNotification);
    await this.kv.set(
      DbPatterns.workflow.notificationByRecipient(notification.recipientId, id),
      id,
    );
    await this.kv.set(
      DbPatterns.workflow.notificationByWorkflow(notification.workflowId, id),
      id,
    );

    return fullNotification;
  }

  async getUserNotifications(
    userId: UUID,
    unreadOnly = false,
  ): Promise<EnhancedWorkflowNotification[]> {
    const notifications: EnhancedWorkflowNotification[] = [];
    const iterator = this.kv.list({
      prefix: [DbPatterns.workflow.notificationByRecipient(userId, "")],
    });

    for await (const entry of iterator) {
      const notificationId = entry.value as UUID;
      const notification = await this.kv.get(
        DbPatterns.workflow.notification(notificationId),
      );
      if (notification.value) {
        const notificationData = notification
          .value as EnhancedWorkflowNotification;
        if (!unreadOnly || !notificationData.isRead) {
          notifications.push(notificationData);
        }
      }
    }

    return notifications.sort((a, b) => b.createdAt - a.createdAt);
  }

  async markNotificationRead(id: UUID): Promise<void> {
    const existing = await this.kv.get(DbPatterns.workflow.notification(id));
    if (existing.value) {
      const notification = existing.value as EnhancedWorkflowNotification;
      const updated = {
        ...notification,
        isRead: true,
        readAt: new Date(),
        updatedAt: Date.now(),
      };
      await this.kv.set(DbPatterns.workflow.notification(id), updated);
    }
  }

  // Analytics and Reporting
  async getWorkflowAnalytics(
    templateId?: UUID,
    dateRange?: { start: Date; end: Date },
  ): Promise<{
    totalWorkflows: number;
    completedWorkflows: number;
    averageCompletionTime: number;
    statusDistribution: Record<string, number>;
    priorityDistribution: Record<string, number>;
  }> {
    const analytics = {
      totalWorkflows: 0,
      completedWorkflows: 0,
      averageCompletionTime: 0,
      statusDistribution: {} as Record<string, number>,
      priorityDistribution: {} as Record<string, number>,
    };

    let iterator;
    if (templateId) {
      iterator = this.kv.list({
        prefix: [DbPatterns.workflow.instanceByTemplate(templateId, "")],
      });
    } else {
      iterator = this.kv.list({ prefix: ["workflow", "instance"] });
    }

    const completionTimes: number[] = [];

    for await (const entry of iterator) {
      let instance: WorkflowInstance;

      if (entry.key.length === 3) {
        instance = entry.value as WorkflowInstance;
      } else {
        const instanceId = entry.value as UUID;
        const instanceData = await this.getInstance(instanceId);
        if (!instanceData) continue;
        instance = instanceData;
      }

      // Apply date range filter
      if (dateRange) {
        const createdAt = new Date(instance.createdAt);
        if (createdAt < dateRange.start || createdAt > dateRange.end) continue;
      }

      analytics.totalWorkflows++;

      // Status distribution
      analytics.statusDistribution[instance.status] =
        (analytics.statusDistribution[instance.status] || 0) + 1;

      // Priority distribution
      analytics.priorityDistribution[instance.priority] =
        (analytics.priorityDistribution[instance.priority] || 0) + 1;

      // Completion metrics
      if (instance.status === "completed" && instance.completedAt) {
        analytics.completedWorkflows++;
        const completionTime = instance.completedAt.getTime() -
          instance.createdAt;
        completionTimes.push(completionTime);
      }
    }

    // Calculate average completion time in hours
    if (completionTimes.length > 0) {
      const totalTime = completionTimes.reduce((sum, time) => sum + time, 0);
      analytics.averageCompletionTime = (totalTime / completionTimes.length) /
        (1000 * 60 * 60); // Convert to hours
    }

    return analytics;
  }

  // Search functionality
  async searchWorkflows(query: string, filters: {
    status?: EnhancedWorkflowStatus[];
    assignedTo?: UUID[];
    priority?: string[];
    templateId?: UUID[];
    limit?: number;
  } = {}): Promise<WorkflowInstance[]> {
    const allInstances = await this.listInstances({ limit: 1000 });
    const searchTerms = query.toLowerCase().split(" ").filter((term) =>
      term.length > 0
    );

    return allInstances.instances.filter((instance) => {
      // Text search
      const searchableText = `${instance.title} ${instance.contentType}`
        .toLowerCase();
      const matchesQuery = query === "" ||
        searchTerms.every((term) => searchableText.includes(term));

      // Apply filters
      if (filters.status && !filters.status.includes(instance.status)) {
        return false;
      }
      if (
        filters.assignedTo &&
        !filters.assignedTo.some((id) => instance.assignedTo.includes(id))
      ) return false;
      if (filters.priority && !filters.priority.includes(instance.priority)) {
        return false;
      }
      if (
        filters.templateId && !filters.templateId.includes(instance.templateId)
      ) return false;

      return matchesQuery;
    }).slice(0, filters.limit || 20);
  }
}
