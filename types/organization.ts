// Organization & Multi-tenancy Type Definitions
import type { UUID, BaseEntity } from "./base.ts";

// Organization and Tenant Management
export type OrganizationStatus = "active" | "suspended" | "trial" | "expired" | "deleted";
export type OrganizationPlan = "free" | "starter" | "professional" | "enterprise" | "custom";
export type TeamRole = "owner" | "admin" | "manager" | "editor" | "viewer" | "guest";
export type InvitationStatus = "pending" | "accepted" | "declined" | "expired";

// Core Organization Entity
export interface Organization extends BaseEntity {
  name: string;
  slug: string;
  domain?: string;
  description?: string;
  logoUrl?: string;
  status: OrganizationStatus;
  plan: OrganizationPlan;
  settings: OrganizationSettings;
  billing: OrganizationBilling;
  ownerId: UUID;
  createdBy: UUID;
  isPersonal: boolean;
}

export interface OrganizationSettings {
  features: {
    workflow_enabled: boolean;
    collaboration_enabled: boolean;
    advanced_analytics: boolean;
    api_access: boolean;
  };
  security: {
    requireTwoFactor: boolean;
    allowedDomains: string[];
    sessionTimeout: number;
  };
}

export interface OrganizationBilling {
  plan: OrganizationPlan;
  status: "active" | "past_due" | "canceled" | "trialing";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  usage: UsageMetrics;
  limits: PlanLimits;
}

export interface UsageMetrics {
  users: number;
  content: number;
  storage: number;
  workflows: number;
}

export interface PlanLimits {
  maxUsers: number;
  maxContent: number;
  maxStorage: number;
  maxWorkflows: number;
}

export interface Team extends BaseEntity {
  organizationId: UUID;
  name: string;
  description?: string;
  color: string;
  createdBy: UUID;
  isDefault: boolean;
}

export interface TeamMember extends BaseEntity {
  teamId: UUID;
  userId: UUID;
  organizationId: UUID;
  role: TeamRole;
  permissions: string[];
  joinedAt: Date;
  status: "active" | "inactive" | "pending";
}
