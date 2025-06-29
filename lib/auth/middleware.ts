// Authentication Middleware
// Fresh framework middleware for authentication and authorization

import type { MiddlewareHandlerContext } from "$fresh/server.ts";
import type { JWTPayload } from "@/types";
import { extractBearerToken, JWTManager } from "./jwt.ts";
import { AuthService } from "./service.ts";
import { RBACManager } from "./rbac.ts";

// Extend Fresh context with auth data
export interface AuthContext {
  user?: JWTPayload;
  sessionId?: string;
  permissions?: string[];
}

// Authentication middleware
export async function authMiddleware(
  req: Request,
  ctx: MiddlewareHandlerContext,
): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Skip auth for public routes
  const publicRoutes = [
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/refresh",
    "/api/health",
    "/_fresh/",
    "/static/",
  ];

  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );
  if (isPublicRoute) {
    return await ctx.next();
  }

  // Extract token from Authorization header or cookie
  let token = extractBearerToken(req.headers.get("authorization"));

  if (!token) {
    // Try to get token from cookie
    const cookies = req.headers.get("cookie");
    if (cookies) {
      const tokenMatch = cookies.match(/accessToken=([^;]+)/);
      if (tokenMatch) {
        token = tokenMatch[1];
      }
    }
  }

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Validate token
  const payload = await JWTManager.validateAccessToken(token);
  if (!payload) {
    return new Response("Invalid token", { status: 401 });
  }

  // Validate session
  const sessionData = await AuthService.validateSession(payload.sessionId);
  if (!sessionData) {
    return new Response("Session expired", { status: 401 });
  }

  // Add auth data to context
  const authContext: AuthContext = {
    user: payload,
    sessionId: payload.sessionId,
    permissions: sessionData.permissions,
  };

  // Add to request context
  (req as any).auth = authContext;

  return await ctx.next();
}

// Permission checking middleware factory
export function requirePermissions(...requiredPermissions: string[]) {
  return async (
    req: Request,
    ctx: MiddlewareHandlerContext,
  ): Promise<Response> => {
    const authContext = (req as any).auth as AuthContext;

    if (!authContext?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Check permissions
    const hasPermission = await RBACManager.userHasAnyPermission(
      authContext.user.userId,
      requiredPermissions,
    );

    if (!hasPermission) {
      return new Response("Forbidden", { status: 403 });
    }

    return await ctx.next();
  };
}

// Role checking middleware factory
export function requireRoles(...requiredRoles: string[]) {
  return async (
    req: Request,
    ctx: MiddlewareHandlerContext,
  ): Promise<Response> => {
    const authContext = (req as any).auth as AuthContext;

    if (!authContext?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Check if user has any of the required roles
    const userRoles = authContext.user.roles || [];
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return new Response("Forbidden", { status: 403 });
    }

    return await ctx.next();
  };
}

// Admin only middleware
export const requireAdmin = requireRoles("Super Admin", "Administrator");

// Editor or higher middleware
export const requireEditor = requireRoles(
  "Super Admin",
  "Administrator",
  "Editor",
);

// Helper function to get auth context from request
export function getAuthContext(req: Request): AuthContext | null {
  return (req as any).auth || null;
}

// Helper function to check if user is authenticated
export function isAuthenticated(req: Request): boolean {
  const authContext = getAuthContext(req);
  return !!authContext?.user;
}

// Helper function to get current user ID
export function getCurrentUserId(req: Request): string | null {
  const authContext = getAuthContext(req);
  return authContext?.user?.userId || null;
}

// Helper function to check permission
export async function hasPermission(
  req: Request,
  permission: string,
): Promise<boolean> {
  const authContext = getAuthContext(req);
  if (!authContext?.user) {
    return false;
  }

  return await RBACManager.userHasPermission(
    authContext.user.userId,
    permission,
  );
}

// Helper function to check role
export async function hasRole(req: Request, role: string): Promise<boolean> {
  const authContext = getAuthContext(req);
  if (!authContext?.user) {
    return false;
  }

  return await RBACManager.userHasRole(authContext.user.userId, role);
}
