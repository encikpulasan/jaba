// Organization Repository
// Multi-tenant data access layer

import { BaseRepository } from "@/lib/db/repositories/base.ts";
import { DbPatterns } from "@/lib/db/patterns.ts";
import { db } from "@/lib/db/connection.ts";
import type { Organization, Team, TeamMember } from "@/types/organization.ts";
import type { UUID } from "@/types/base.ts";

export class OrganizationRepository {
  private get kv(): Deno.Kv {
    return db.getConnection().kv as Deno.Kv;
  }
  // Organization Management
  async createOrganization(
    org: Omit<Organization, "id" | "createdAt" | "updatedAt">,
  ): Promise<Organization> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const fullOrganization: Organization = {
      ...org,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.kv.set(DbPatterns.organization.byId(id), fullOrganization);
    await this.kv.set(DbPatterns.organization.bySlug(org.slug), id);

    console.log(`✅ Created organization: ${org.name}`);
    return fullOrganization;
  }

  async getOrganization(id: UUID): Promise<Organization | null> {
    const result = await this.kv.get(DbPatterns.organization.byId(id));
    return result.value as Organization | null;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    const slugResult = await this.kv.get(DbPatterns.organization.bySlug(slug));
    if (!slugResult.value) return null;

    const orgId = slugResult.value as UUID;
    return await this.getOrganization(orgId);
  }

  // Team Management
  async createTeam(
    team: Omit<Team, "id" | "createdAt" | "updatedAt">,
  ): Promise<Team> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const fullTeam: Team = {
      ...team,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.kv.set(DbPatterns.organization.team(id), fullTeam);

    console.log(`✅ Created team: ${team.name}`);
    return fullTeam;
  }

  async getTeam(id: UUID): Promise<Team | null> {
    const result = await this.kv.get(DbPatterns.organization.team(id));
    return result.value as Team | null;
  }

  // Team Membership
  async addTeamMember(
    member: Omit<TeamMember, "id" | "createdAt" | "updatedAt">,
  ): Promise<TeamMember> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const fullMember: TeamMember = {
      ...member,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.kv.set(DbPatterns.organization.teamMember(id), fullMember);

    console.log(`✅ Added team member: ${member.userId}`);
    return fullMember;
  }

  async getUserTeams(userId: UUID): Promise<TeamMember[]> {
    const memberships: TeamMember[] = [];
    // Simplified implementation for demo
    return memberships;
  }

  async validateOrganizationAccess(
    userId: UUID,
    organizationId: UUID,
  ): Promise<boolean> {
    const memberships = await this.getUserTeams(userId);
    return memberships.some((membership) =>
      membership.organizationId === organizationId
    );
  }
}
