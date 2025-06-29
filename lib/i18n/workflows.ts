// Translation Workflow System
// Manages translation processes, approvals, and collaboration

import type {
  ContentTranslation,
  Locale,
  TranslationStatus,
  TranslationWorkflow,
  UUID,
  WorkflowAction,
  WorkflowStep,
} from "@/types";
import { db } from "@/lib/db/mod.ts";
import { KeyPatterns } from "@/lib/db/patterns.ts";
import ContentLocalizationManager from "./content.ts";

export class TranslationWorkflowManager {
  // Create a new translation workflow
  static async createWorkflow(
    contentId: UUID,
    sourceLocale: Locale,
    targetLocale: Locale,
    requestedBy: UUID,
    assignedTo?: UUID,
    priority: "low" | "medium" | "high" = "medium",
    deadline?: number,
  ): Promise<TranslationWorkflow> {
    const workflowId = crypto.randomUUID();
    const now = Date.now();

    const workflow: TranslationWorkflow = {
      id: workflowId,
      contentId,
      sourceLocale,
      targetLocale,
      status: "pending",
      priority,
      requestedBy,
      assignedTo,
      deadline,
      createdAt: now,
      updatedAt: now,
      steps: [
        {
          id: crypto.randomUUID(),
          type: "translate",
          status: "pending",
          assignedTo,
          createdAt: now,
        },
        {
          id: crypto.randomUUID(),
          type: "review",
          status: "waiting",
          createdAt: now,
        },
        {
          id: crypto.randomUUID(),
          type: "approve",
          status: "waiting",
          createdAt: now,
        },
      ],
      actions: [],
    };

    // Store workflow
    const connection = db.getConnection();
    await (connection.kv as Deno.Kv).set(
      KeyPatterns.workflows.byId(workflowId),
      workflow,
    );

    return workflow;
  }

  // Update workflow status
  static async updateWorkflowStatus(
    workflowId: UUID,
    status: TranslationStatus,
    userId: UUID,
    comment?: string,
  ): Promise<TranslationWorkflow | null> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      return null;
    }

    const now = Date.now();
    const action: WorkflowAction = {
      id: crypto.randomUUID(),
      type: "status_change",
      userId,
      timestamp: now,
      comment,
      data: { from: workflow.status, to: status },
    };

    const updatedWorkflow: TranslationWorkflow = {
      ...workflow,
      status,
      updatedAt: now,
      actions: [...workflow.actions, action],
    };

    // Handle status-specific updates
    switch (status) {
      case "in_progress":
        updatedWorkflow.startedAt = now;
        break;
      case "review":
        updatedWorkflow.submittedAt = now;
        break;
      case "approved":
        updatedWorkflow.approvedAt = now;
        updatedWorkflow.approvedBy = userId;
        break;
      case "published":
        updatedWorkflow.completedAt = now;
        break;
      case "rejected":
        updatedWorkflow.rejectedAt = now;
        updatedWorkflow.rejectedBy = userId;
        break;
    }

    // Update workflow steps
    updatedWorkflow.steps = this.updateWorkflowSteps(
      workflow.steps,
      status,
      userId,
      now,
    );

    // Store updated workflow
    const connection = db.getConnection();
    await (connection.kv as Deno.Kv).set(
      KeyPatterns.workflows.byId(workflowId),
      updatedWorkflow,
    );

    return updatedWorkflow;
  }

  // Update workflow steps based on status
  private static updateWorkflowSteps(
    steps: WorkflowStep[],
    status: TranslationStatus,
    userId: UUID,
    timestamp: number,
  ): WorkflowStep[] {
    return steps.map((step) => {
      switch (status) {
        case "in_progress":
          if (step.type === "translate" && step.status === "pending") {
            return {
              ...step,
              status: "in_progress",
              startedAt: timestamp,
              assignedTo: step.assignedTo || userId,
            };
          }
          break;
        case "review":
          if (step.type === "translate" && step.status === "in_progress") {
            return { ...step, status: "completed", completedAt: timestamp };
          }
          if (step.type === "review" && step.status === "waiting") {
            return { ...step, status: "pending" };
          }
          break;
        case "approved":
          if (step.type === "review" && step.status === "pending") {
            return { ...step, status: "completed", completedAt: timestamp };
          }
          if (step.type === "approve" && step.status === "waiting") {
            return { ...step, status: "completed", completedAt: timestamp };
          }
          break;
      }
      return step;
    });
  }

  // Get workflow by ID
  static async getWorkflow(
    workflowId: UUID,
  ): Promise<TranslationWorkflow | null> {
    const connection = db.getConnection();
    const result = await (connection.kv as Deno.Kv).get<TranslationWorkflow>(
      KeyPatterns.workflows.byId(workflowId),
    );
    return result.value || null;
  }

  // Get workflows for content
  static async getWorkflowsForContent(
    contentId: UUID,
  ): Promise<TranslationWorkflow[]> {
    const connection = db.getConnection();
    const workflows: TranslationWorkflow[] = [];

    const iterator = (connection.kv as Deno.Kv).list<TranslationWorkflow>({
      prefix: KeyPatterns.workflows.all(),
    });

    for await (const { value } of iterator) {
      if (value && value.contentId === contentId) {
        workflows.push(value);
      }
    }

    return workflows.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Get workflows assigned to user
  static async getAssignedWorkflows(
    userId: UUID,
    status?: TranslationStatus,
  ): Promise<TranslationWorkflow[]> {
    const connection = db.getConnection();
    const workflows: TranslationWorkflow[] = [];

    const iterator = (connection.kv as Deno.Kv).list<TranslationWorkflow>({
      prefix: KeyPatterns.workflows.all(),
    });

    for await (const { value } of iterator) {
      if (value && value.assignedTo === userId) {
        if (!status || value.status === status) {
          workflows.push(value);
        }
      }
    }

    return workflows.sort((a, b) => {
      // Sort by priority first, then by deadline, then by creation date
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const aPriority = priorityOrder[a.priority] || 0;
      const bPriority = priorityOrder[b.priority] || 0;

      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }

      if (a.deadline && b.deadline) {
        return a.deadline - b.deadline;
      }

      return b.createdAt - a.createdAt;
    });
  }

  // Assign workflow to user
  static async assignWorkflow(
    workflowId: UUID,
    assignedTo: UUID,
    assignedBy: UUID,
  ): Promise<TranslationWorkflow | null> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      return null;
    }

    const now = Date.now();
    const action: WorkflowAction = {
      id: crypto.randomUUID(),
      type: "assignment",
      userId: assignedBy,
      timestamp: now,
      data: { assigned_to: assignedTo },
    };

    const updatedWorkflow: TranslationWorkflow = {
      ...workflow,
      assignedTo,
      updatedAt: now,
      actions: [...workflow.actions, action],
    };

    // Update translate step assignment
    updatedWorkflow.steps = workflow.steps.map((step) => {
      if (step.type === "translate" && step.status === "pending") {
        return { ...step, assignedTo };
      }
      return step;
    });

    const connection = db.getConnection();
    await (connection.kv as Deno.Kv).set(
      KeyPatterns.workflows.byId(workflowId),
      updatedWorkflow,
    );

    return updatedWorkflow;
  }

  // Add comment to workflow
  static async addComment(
    workflowId: UUID,
    userId: UUID,
    comment: string,
  ): Promise<TranslationWorkflow | null> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      return null;
    }

    const now = Date.now();
    const action: WorkflowAction = {
      id: crypto.randomUUID(),
      type: "comment",
      userId,
      timestamp: now,
      comment,
    };

    const updatedWorkflow: TranslationWorkflow = {
      ...workflow,
      updatedAt: now,
      actions: [...workflow.actions, action],
    };

    const connection = db.getConnection();
    await (connection.kv as Deno.Kv).set(
      KeyPatterns.workflows.byId(workflowId),
      updatedWorkflow,
    );

    return updatedWorkflow;
  }

  // Get workflow statistics
  static async getWorkflowStats(): Promise<{
    total: number;
    byStatus: Record<TranslationStatus, number>;
    byPriority: Record<"low" | "medium" | "high", number>;
    overdue: number;
    averageCompletionTime: number;
  }> {
    const connection = db.getConnection();
    let total = 0;
    const byStatus: Record<TranslationStatus, number> = {
      draft: 0,
      pending: 0,
      in_progress: 0,
      review: 0,
      approved: 0,
      published: 0,
      rejected: 0,
    };
    const byPriority = { low: 0, medium: 0, high: 0 };
    let overdue = 0;
    let completionTimes: number[] = [];
    const now = Date.now();

    const iterator = (connection.kv as Deno.Kv).list<TranslationWorkflow>({
      prefix: KeyPatterns.workflows.all(),
    });

    for await (const { value } of iterator) {
      if (value) {
        total++;
        byStatus[value.status as TranslationStatus]++;
        byPriority[value.priority]++;

        // Check if overdue
        if (
          value.deadline && now > value.deadline &&
          !["published", "rejected"].includes(value.status)
        ) {
          overdue++;
        }

        // Calculate completion time for completed workflows
        if (value.completedAt && value.createdAt) {
          completionTimes.push(value.completedAt - value.createdAt);
        }
      }
    }

    const averageCompletionTime = completionTimes.length > 0
      ? completionTimes.reduce((sum, time) => sum + time, 0) /
        completionTimes.length
      : 0;

    return {
      total,
      byStatus,
      byPriority,
      overdue,
      averageCompletionTime: Math.round(
        averageCompletionTime / (1000 * 60 * 60),
      ), // Convert to hours
    };
  }
}

export default TranslationWorkflowManager;
