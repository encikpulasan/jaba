// Organization API Routes
// RESTful API for multi-tenant organization management

import { Handlers } from "$fresh/server.ts";
import { organizationService } from "@/lib/organization/service.ts";
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
  // GET /api/organization - List user's organizations
  async GET(req) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const organizations = await organizationService.getUserOrganizations(authContext.userId);

      return new Response(JSON.stringify({
        success: true,
        data: organizations,
        total: organizations.length,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      console.error("Error listing organizations:", error);
      return new Response(JSON.stringify({ 
        error: error.message || "Failed to list organizations" 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },

  // POST /api/organization - Create new organization
  async POST(req) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const body = await req.json();
      
      // Validate required fields
      if (!body.name || !body.slug) {
        return new Response(JSON.stringify({ 
          error: "Missing required fields: name, slug" 
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const organization = await organizationService.createOrganization(
        {
          name: body.name,
          slug: body.slug,
          description: body.description,
          industry: body.industry,
          size: body.size || "1-10",
          plan: body.plan || "free",
        },
        authContext.userId
      );

      return new Response(JSON.stringify({
        success: true,
        data: organization,
        message: "Organization created successfully",
      }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      console.error("Error creating organization:", error);
      return new Response(JSON.stringify({ 
        error: error.message || "Failed to create organization" 
      }), {
        status: error.message?.includes("already exists") ? 409 : 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

// GET /api/organization/:slug - Get organization by slug
export const organizationBySlugHandler: Handlers = {
  async GET(req, ctx) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const slug = ctx.params.slug;
      const organization = await organizationService.getOrganizationBySlug(slug, authContext.userId);

      if (!organization) {
        return new Response(JSON.stringify({ error: "Organization not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        data: organization,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      console.error("Error getting organization:", error);
      return new Response(JSON.stringify({ 
        error: error.message || "Failed to get organization" 
      }), {
        status: error.message?.includes("Access denied") ? 403 : 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

// POST /api/organization/:slug/teams - Create team in organization
export const organizationTeamsHandler: Handlers = {
  async POST(req, ctx) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const slug = ctx.params.slug;
      const organization = await organizationService.getOrganizationBySlug(slug, authContext.userId);

      if (!organization) {
        return new Response(JSON.stringify({ error: "Organization not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const body = await req.json();

      if (!body.name) {
        return new Response(JSON.stringify({ 
          error: "Missing required field: name" 
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const team = await organizationService.createTeam(
        organization.id,
        {
          name: body.name,
          description: body.description,
          color: body.color || "#3B82F6",
        },
        authContext.userId
      );

      return new Response(JSON.stringify({
        success: true,
        data: team,
        message: "Team created successfully",
      }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      console.error("Error creating team:", error);
      return new Response(JSON.stringify({ 
        error: error.message || "Failed to create team" 
      }), {
        status: error.message?.includes("Access denied") ? 403 : 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

// POST /api/organization/:slug/members - Add member to organization
export const organizationMembersHandler: Handlers = {
  async POST(req, ctx) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const slug = ctx.params.slug;
      const organization = await organizationService.getOrganizationBySlug(slug, authContext.userId);

      if (!organization) {
        return new Response(JSON.stringify({ error: "Organization not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const body = await req.json();

      if (!body.userId || !body.teamId || !body.role) {
        return new Response(JSON.stringify({ 
          error: "Missing required fields: userId, teamId, role" 
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const member = await organizationService.addTeamMember(
        body.teamId,
        body.userId,
        body.role,
        authContext.userId
      );

      return new Response(JSON.stringify({
        success: true,
        data: member,
        message: "Team member added successfully",
      }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      console.error("Error adding team member:", error);
      return new Response(JSON.stringify({ 
        error: error.message || "Failed to add team member" 
      }), {
        status: error.message?.includes("Access denied") ? 403 : 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

// GET /api/organization/:slug/analytics - Get organization analytics
export const organizationAnalyticsHandler: Handlers = {
  async GET(req, ctx) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const slug = ctx.params.slug;
      const organization = await organizationService.getOrganizationBySlug(slug, authContext.userId);

      if (!organization) {
        return new Response(JSON.stringify({ error: "Organization not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const url = new URL(req.url);
      const startDate = url.searchParams.get("startDate");
      const endDate = url.searchParams.get("endDate");

      const period = {
        start: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        end: endDate ? new Date(endDate) : new Date(),
      };

      const analytics = await organizationService.getOrganizationAnalytics(
        organization.id,
        authContext.userId,
        period
      );

      return new Response(JSON.stringify({
        success: true,
        data: analytics,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      console.error("Error getting organization analytics:", error);
      return new Response(JSON.stringify({ 
        error: error.message || "Failed to get analytics" 
      }), {
        status: error.message?.includes("Access denied") ? 403 : 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
