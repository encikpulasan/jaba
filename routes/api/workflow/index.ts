// Workflow API Routes
// RESTful API for workflow management and collaboration

import { Handlers } from "$fresh/server.ts";
import { workflowService } from "@/lib/workflow/service.ts";
import { authService } from "@/lib/auth/service.ts";
import type { AuthContext } from "@/types/auth.ts";

// Helper function to extract auth context from request
async function getAuthContext(req: Request): Promise<AuthContext | null> {
  const authHeader = req.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    // JWT Token
    const token = authHeader.substring(7);
    return await authService.getContextFromJWT(token);
  } else if (authHeader?.startsWith("ApiKey ")) {
    // API Key
    const apiKey = authHeader.substring(7);
    return await authService.getContextFromApiKey(apiKey);
  }

  return null;
}

export const handler: Handlers = {
  // GET /api/workflow - List workflows
  async GET(req) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const url = new URL(req.url);
      const params = url.searchParams;

      // Parse query parameters
      const options = {
        contentType: params.get("contentType") || undefined,
        status: params.get("status") || undefined,
        assigneeId: params.get("assigneeId") || undefined,
        priority: params.get("priority") || undefined,
        templateId: params.get("templateId") || undefined,
        isOverdue: params.get("isOverdue") === "true" || undefined,
        limit: params.get("limit") ? parseInt(params.get("limit")!) : 20,
        offset: params.get("offset") ? parseInt(params.get("offset")!) : 0,
      };

      const result = await workflowService.listInstances(
        options,
        authContext.userId,
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: result,
          pagination: {
            limit: options.limit,
            offset: options.offset,
            total: result.total,
            hasMore: result.instances.length === options.limit,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error listing workflows:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to list workflows",
        }),
        {
          status: error.message?.includes("permission") ? 403 : 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },

  // POST /api/workflow - Start a new workflow
  async POST(req) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const body = await req.json();

      // Validate required fields
      if (!body.templateId || !body.contentId || !body.title) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: templateId, contentId, title",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const workflow = await workflowService.startWorkflow(
        body.templateId,
        body.contentId,
        body.contentType || "content",
        body.title,
        authContext.userId,
        {
          priority: body.priority,
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          assignedTo: body.assignedTo,
          tags: body.tags,
          customFields: body.customFields,
        },
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: workflow,
          message: "Workflow started successfully",
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error starting workflow:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to start workflow",
        }),
        {
          status: error.message?.includes("permission") ? 403 : 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};

// GET /api/workflow/:id - Get specific workflow
export const workflowByIdHandler: Handlers = {
  async GET(req, ctx) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const workflowId = ctx.params.id;
      const workflow = await workflowService.getInstance(
        workflowId,
        authContext.userId,
      );

      if (!workflow) {
        return new Response(JSON.stringify({ error: "Workflow not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: workflow,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error getting workflow:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to get workflow",
        }),
        {
          status: error.message?.includes("permission") ? 403 : 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};

// POST /api/workflow/:id/transition - Transition workflow to next stage
export const workflowTransitionHandler: Handlers = {
  async POST(req, ctx) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const workflowId = ctx.params.id;
      const body = await req.json();

      if (!body.fromStage || !body.toStage || !body.actionType) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: fromStage, toStage, actionType",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const updatedWorkflow = await workflowService.transitionWorkflow(
        workflowId,
        body.fromStage,
        body.toStage,
        body.actionType,
        authContext.userId,
        {
          comment: body.comment,
          attachments: body.attachments,
          assignTo: body.assignTo,
        },
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: updatedWorkflow,
          message: `Workflow ${body.actionType} successfully`,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error transitioning workflow:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to transition workflow",
        }),
        {
          status: error.message?.includes("permission") ? 403 : 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};

// POST /api/workflow/:id/assign - Assign workflow to user
export const workflowAssignHandler: Handlers = {
  async POST(req, ctx) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const workflowId = ctx.params.id;
      const body = await req.json();

      if (!body.assigneeId || !body.stageId) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: assigneeId, stageId",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const assignment = await workflowService.assignWorkflow(
        workflowId,
        body.stageId,
        body.assigneeId,
        authContext.userId,
        {
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          notes: body.notes,
          estimatedHours: body.estimatedHours,
        },
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: assignment,
          message: "Workflow assigned successfully",
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error assigning workflow:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to assign workflow",
        }),
        {
          status: error.message?.includes("permission") ? 403 : 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};

// GET /api/workflow/:id/comments - Get workflow comments
export const workflowCommentsHandler: Handlers = {
  async GET(req, ctx) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const workflowId = ctx.params.id;
      const comments = await workflowService.getWorkflowComments(
        workflowId,
        authContext.userId,
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: comments,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error getting workflow comments:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to get workflow comments",
        }),
        {
          status: error.message?.includes("permission") ? 403 : 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },

  // POST /api/workflow/:id/comments - Add comment to workflow
  async POST(req, ctx) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const workflowId = ctx.params.id;
      const body = await req.json();

      if (!body.content || body.content.trim().length === 0) {
        return new Response(
          JSON.stringify({
            error: "Comment content is required",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const comment = await workflowService.addComment(
        workflowId,
        authContext.userId,
        body.content,
        {
          stageId: body.stageId,
          mentions: body.mentions,
          attachments: body.attachments,
          isInternal: body.isInternal,
          parentCommentId: body.parentCommentId,
        },
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: comment,
          message: "Comment added successfully",
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error adding workflow comment:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to add comment",
        }),
        {
          status: error.message?.includes("permission") ? 403 : 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};

// POST /api/workflow/:id/join - Join workflow for real-time collaboration
export const workflowJoinHandler: Handlers = {
  async POST(req, ctx) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const workflowId = ctx.params.id;
      await workflowService.joinWorkflow(workflowId, authContext.userId);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Joined workflow successfully",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error joining workflow:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to join workflow",
        }),
        {
          status: error.message?.includes("permission") ? 403 : 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};

// POST /api/workflow/:id/leave - Leave workflow collaboration
export const workflowLeaveHandler: Handlers = {
  async POST(req, ctx) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const workflowId = ctx.params.id;
      await workflowService.leaveWorkflow(workflowId, authContext.userId);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Left workflow successfully",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error leaving workflow:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to leave workflow",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};

// POST /api/workflow/:id/tasks - Create workflow task
export const workflowTasksHandler: Handlers = {
  async POST(req, ctx) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const workflowId = ctx.params.id;
      const body = await req.json();

      if (!body.title || !body.assigneeId || !body.stageId) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: title, assigneeId, stageId",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const task = await workflowService.createTask(
        workflowId,
        body.stageId,
        {
          title: body.title,
          description: body.description,
          assigneeId: body.assigneeId,
          priority: body.priority,
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          estimatedHours: body.estimatedHours,
          tags: body.tags,
          checklist: body.checklist,
        },
        authContext.userId,
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: task,
          message: "Task created successfully",
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error creating workflow task:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to create task",
        }),
        {
          status: error.message?.includes("permission") ? 403 : 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};

// GET /api/workflow/analytics - Get workflow analytics
export const workflowAnalyticsHandler: Handlers = {
  async GET(req) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const url = new URL(req.url);
      const params = url.searchParams;

      const options = {
        templateId: params.get("templateId") || undefined,
        dateRange: params.get("startDate") && params.get("endDate")
          ? {
            start: new Date(params.get("startDate")!),
            end: new Date(params.get("endDate")!),
          }
          : undefined,
        includeTeamMetrics: params.get("includeTeamMetrics") === "true",
      };

      const analytics = await workflowService.getWorkflowAnalytics(
        authContext.userId,
        options,
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: analytics,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error getting workflow analytics:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to get analytics",
        }),
        {
          status: error.message?.includes("permission") ? 403 : 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
