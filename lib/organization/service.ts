// Organization Service
// Business logic for multi-tenant organization management

import { OrganizationRepository } from "./repository.ts";
import { authService } from "@/lib/auth/service.ts";
import type {
  Organization,
  Team,
  TeamMember,
  OrganizationInvitation,
  OrganizationApiKey,
  OrganizationAnalytics,
  OrganizationStatus,
  TeamRole,
} from "@/types/organization.ts";
import type { UUID } from "@/types/base.ts";

export class OrganizationService {
  private repository: OrganizationRepository;

  constructor() {
    this.repository = new OrganizationRepository();
  }

  // Organization Management
  async createOrganization(
    orgData: {
      name: string;
      slug: string;
      description?: string;
      industry?: string;
      size: "1-10" | "11-50" | "51-200" | "201-1000" | "1000+";
      plan: "free" | "starter" | "professional" | "enterprise";
    },
    ownerId: UUID
  ): Promise<Organization> {
    // Validate slug uniqueness
    const existingOrg = await this.repository.getOrganizationBySlug(orgData.slug);
    if (existingOrg) {
      throw new Error("Organization slug already exists");
    }

    // Create organization with default settings
    const organization = await this.repository.createOrganization({
      ...orgData,
      status: "active",
      ownerId,
      createdBy: ownerId,
      isPersonal: false,
      settings: this.getDefaultSettings(orgData.plan),
      billing: this.getDefaultBilling(orgData.plan),
    });

    // Create default team
    await this.createDefaultTeam(organization.id, ownerId);

    console.log(`🏢 Created organization: ${orgData.name}`);
    return organization;
  }

  async getOrganization(id: UUID, userId: UUID): Promise<Organization | null> {
    const organization = await this.repository.getOrganization(id);
    if (!organization) return null;

    // Check access permissions
    const hasAccess = await this.repository.validateOrganizationAccess(userId, id);
    if (!hasAccess) {
      throw new Error("Access denied to organization");
    }

    return organization;
  }

  async getOrganizationBySlug(slug: string, userId: UUID): Promise<Organization | null> {
    const organization = await this.repository.getOrganizationBySlug(slug);
    if (!organization) return null;

    // Check access permissions
    const hasAccess = await this.repository.validateOrganizationAccess(userId, organization.id);
    if (!hasAccess) {
      throw new Error("Access denied to organization");
    }

    return organization;
  }

  async getUserOrganizations(userId: UUID): Promise<Organization[]> {
    const teams = await this.repository.getUserTeams(userId);
    const organizationIds = [...new Set(teams.map(team => team.organizationId))];
    
    const organizations: Organization[] = [];
    for (const orgId of organizationIds) {
      const org = await this.repository.getOrganization(orgId);
      if (org) {
        organizations.push(org);
      }
    }
    
    return organizations.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Team Management
  async createTeam(
    organizationId: UUID,
    teamData: {
      name: string;
      description?: string;
      color: string;
    },
    createdBy: UUID
  ): Promise<Team> {
    // Validate organization access
    const hasAccess = await this.repository.validateOrganizationAccess(createdBy, organizationId);
    if (!hasAccess) {
      throw new Error("Access denied to organization");
    }

    const team = await this.repository.createTeam({
      organizationId,
      ...teamData,
      createdBy,
      isDefault: false,
    });

    console.log(`👥 Created team: ${teamData.name}`);
    return team;
  }

  async addTeamMember(
    teamId: UUID,
    userId: UUID,
    role: TeamRole,
    addedBy: UUID
  ): Promise<TeamMember> {
    const team = await this.repository.getTeam(teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    // Validate permissions
    const hasAccess = await this.repository.validateOrganizationAccess(addedBy, team.organizationId);
    if (!hasAccess) {
      throw new Error("Access denied to organization");
    }

    const member = await this.repository.addTeamMember({
      teamId,
      userId,
      organizationId: team.organizationId,
      role,
      permissions: this.getDefaultPermissions(role),
      joinedAt: new Date(),
      invitedBy: addedBy,
      status: "active",
    });

    console.log(`✅ Added team member: ${userId} to team ${teamId}`);
    return member;
  }

  // Organization Analytics
  async getOrganizationAnalytics(
    organizationId: UUID,
    userId: UUID,
    period: { start: Date; end: Date }
  ): Promise<OrganizationAnalytics> {
    // Validate access
    const hasAccess = await this.repository.validateOrganizationAccess(userId, organizationId);
    if (!hasAccess) {
      throw new Error("Access denied to organization");
    }

    return await this.repository.getOrganizationAnalytics(organizationId, period);
  }

  // Utility Methods
  private getDefaultSettings(plan: string) {
    const baseSettings = {
      features: {
        workflow_enabled: true,
        collaboration_enabled: true,
        advanced_analytics: plan === "enterprise",
        api_access: plan !== "free",
      },
      security: {
        requireTwoFactor: false,
        allowedDomains: [],
        sessionTimeout: 480, // 8 hours
      },
    };

    return baseSettings;
  }

  private getDefaultBilling(plan: string) {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

    return {
      plan: plan as any,
      status: "active" as const,
      currentPeriodStart: now,
      currentPeriodEnd: nextMonth,
      usage: {
        users: 0,
        content: 0,
        storage: 0,
        workflows: 0,
      },
      limits: this.getPlanLimits(plan),
    };
  }

  private getPlanLimits(plan: string) {
    const limits = {
      free: {
        maxUsers: 3,
        maxContent: 50,
        maxStorage: 100, // MB
        maxWorkflows: 5,
      },
      starter: {
        maxUsers: 10,
        maxContent: 500,
        maxStorage: 1000, // MB
        maxWorkflows: 20,
      },
      professional: {
        maxUsers: 50,
        maxContent: 5000,
        maxStorage: 10000, // MB
        maxWorkflows: 100,
      },
      enterprise: {
        maxUsers: -1, // Unlimited
        maxContent: -1,
        maxStorage: -1,
        maxWorkflows: -1,
      },
    };

    return limits[plan as keyof typeof limits] || limits.free;
  }

  private getDefaultPermissions(role: TeamRole): string[] {
    const permissions = {
      owner: ["*"], // All permissions
      admin: [
        "manage_content",
        "manage_workflows",
        "manage_media",
        "manage_users",
        "view_analytics",
      ],
      manager: [
        "manage_content",
        "manage_workflows",
        "manage_media",
        "view_analytics",
      ],
      editor: [
        "create_content",
        "edit_content",
        "manage_workflows",
        "manage_media",
      ],
      viewer: [
        "view_content",
        "view_workflows",
        "view_media",
      ],
      guest: [
        "view_content",
      ],
    };

    return permissions[role] || permissions.guest;
  }

  private async createDefaultTeam(organizationId: UUID, ownerId: UUID): Promise<Team> {
    const defaultTeam = await this.repository.createTeam({
      organizationId,
      name: "Default Team",
      description: "Default team for organization members",
      color: "#3B82F6",
      createdBy: ownerId,
      isDefault: true,
    });

    // Add owner to default team
    await this.repository.addTeamMember({
      teamId: defaultTeam.id,
      userId: ownerId,
      organizationId,
      role: "owner",
      permissions: ["*"],
      joinedAt: new Date(),
      status: "active",
    });

    return defaultTeam;
  }
}

// Export singleton instance
export const organizationService = new OrganizationService();
