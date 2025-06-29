import { kv } from "../db/connection.ts";
import { auditLogger } from "./audit.ts";

export interface GDPRRequest {
  id: string;
  userId: string;
  userEmail: string;
  type:
    | "data_export"
    | "data_deletion"
    | "data_portability"
    | "rectification"
    | "restriction";
  status: "pending" | "processing" | "completed" | "rejected";
  requestedAt: string;
  processedAt?: string;
  completedAt?: string;
  requestDetails: Record<string, unknown>;
  fulfillmentData?: Record<string, unknown>;
  organizationId?: string;
  legalBasis?: string;
  notes?: string;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  userEmail: string;
  consentType:
    | "marketing"
    | "analytics"
    | "functional"
    | "necessary"
    | "custom";
  granted: boolean;
  timestamp: string;
  ipAddress: string;
  userAgent: string;
  version: string;
  source: "registration" | "profile_update" | "banner" | "api";
  organizationId?: string;
  expiryDate?: string;
  withdrawnAt?: string;
  details: Record<string, unknown>;
}

export interface DataRetentionPolicy {
  id: string;
  organizationId?: string;
  dataType:
    | "user_data"
    | "content"
    | "audit_logs"
    | "analytics"
    | "media"
    | "custom";
  retentionPeriod: number; // days
  autoDelete: boolean;
  legalBasis: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface PrivacySettings {
  id: string;
  userId: string;
  anonymizeData: boolean;
  allowAnalytics: boolean;
  allowMarketing: boolean;
  allowProfiling: boolean;
  dataPortabilityEnabled: boolean;
  rightToBeForgettenEnabled: boolean;
  updatedAt: string;
  organizationId?: string;
}

export class GDPRService {
  private static instance: GDPRService;

  public static getInstance(): GDPRService {
    if (!GDPRService.instance) {
      GDPRService.instance = new GDPRService();
    }
    return GDPRService.instance;
  }

  // GDPR Request Management
  async createGDPRRequest(
    userId: string,
    userEmail: string,
    type: GDPRRequest["type"],
    requestDetails: Record<string, unknown>,
    organizationId?: string,
  ): Promise<GDPRRequest> {
    const request: GDPRRequest = {
      id: crypto.randomUUID(),
      userId,
      userEmail,
      type,
      status: "pending",
      requestedAt: new Date().toISOString(),
      requestDetails,
      organizationId,
    };

    await kv.set(["gdpr", "requests", request.id], request);
    await kv.set(["gdpr", "by_user", userId, request.id], request.id);

    if (organizationId) {
      await kv.set(["gdpr", "by_org", organizationId, request.id], request.id);
    }

    // Log the GDPR request
    await auditLogger.logEvent({
      eventType: "gdpr_request",
      userId,
      userEmail,
      ipAddress: "system",
      userAgent: "gdpr_service",
      resource: "gdpr_request",
      action: "create",
      details: { requestType: type, requestId: request.id },
      severity: "medium",
      category: "data",
      success: true,
      organizationId,
      complianceFlags: ["gdpr", "data_subject_rights"],
    });

    return request;
  }

  async processGDPRRequest(requestId: string): Promise<void> {
    const result = await kv.get(["gdpr", "requests", requestId]);
    if (!result.value) {
      throw new Error("GDPR request not found");
    }

    const request = result.value as GDPRRequest;
    request.status = "processing";
    request.processedAt = new Date().toISOString();

    await kv.set(["gdpr", "requests", requestId], request);

    // Process based on request type
    switch (request.type) {
      case "data_export":
        await this.processDataExportRequest(request);
        break;
      case "data_deletion":
        await this.processDataDeletionRequest(request);
        break;
      case "data_portability":
        await this.processDataPortabilityRequest(request);
        break;
      case "rectification":
        await this.processRectificationRequest(request);
        break;
      case "restriction":
        await this.processRestrictionRequest(request);
        break;
    }

    request.status = "completed";
    request.completedAt = new Date().toISOString();
    await kv.set(["gdpr", "requests", requestId], request);

    // Log completion
    await auditLogger.logEvent({
      eventType: "gdpr_fulfillment",
      userId: request.userId,
      userEmail: request.userEmail,
      ipAddress: "system",
      userAgent: "gdpr_service",
      resource: "gdpr_request",
      action: "complete",
      details: { requestType: request.type, requestId },
      severity: "medium",
      category: "data",
      success: true,
      organizationId: request.organizationId,
      complianceFlags: ["gdpr", "data_subject_rights", "compliance"],
    });
  }

  private async processDataExportRequest(request: GDPRRequest): Promise<void> {
    const userData = await this.collectUserData(
      request.userId,
      request.organizationId,
    );

    request.fulfillmentData = {
      exportedData: userData,
      exportedAt: new Date().toISOString(),
      format: "json",
      downloadUrl: await this.generateSecureDownloadUrl(userData, request.id),
    };
  }

  private async processDataDeletionRequest(
    request: GDPRRequest,
  ): Promise<void> {
    // Anonymize or delete user data based on legal requirements
    const deletionResults = await this.deleteUserData(
      request.userId,
      request.organizationId,
    );

    request.fulfillmentData = {
      deletionResults,
      deletedAt: new Date().toISOString(),
      retainedData: await this.getRetainedDataSummary(request.userId),
    };
  }

  private async processDataPortabilityRequest(
    request: GDPRRequest,
  ): Promise<void> {
    const portableData = await this.getPortableUserData(
      request.userId,
      request.organizationId,
    );

    request.fulfillmentData = {
      portableData,
      format: "json",
      exportedAt: new Date().toISOString(),
      downloadUrl: await this.generateSecureDownloadUrl(
        portableData,
        request.id,
      ),
    };
  }

  private async processRectificationRequest(
    request: GDPRRequest,
  ): Promise<void> {
    // Update user data based on rectification request
    const updates = request.requestDetails.updates as Record<string, unknown>;
    const updateResults = await this.updateUserData(request.userId, updates);

    request.fulfillmentData = {
      updatedFields: Object.keys(updates),
      updateResults,
      updatedAt: new Date().toISOString(),
    };
  }

  private async processRestrictionRequest(request: GDPRRequest): Promise<void> {
    // Restrict processing of user data
    await this.restrictUserDataProcessing(
      request.userId,
      request.organizationId,
    );

    request.fulfillmentData = {
      restrictedAt: new Date().toISOString(),
      restrictionScope: request.requestDetails.scope || "all",
    };
  }

  // Consent Management
  async recordConsent(
    userId: string,
    userEmail: string,
    consentType: ConsentRecord["consentType"],
    granted: boolean,
    ipAddress: string,
    userAgent: string,
    source: ConsentRecord["source"],
    version: string = "1.0",
    organizationId?: string,
  ): Promise<ConsentRecord> {
    const consent: ConsentRecord = {
      id: crypto.randomUUID(),
      userId,
      userEmail,
      consentType,
      granted,
      timestamp: new Date().toISOString(),
      ipAddress,
      userAgent,
      version,
      source,
      organizationId,
      details: {},
    };

    await kv.set(["gdpr", "consents", consent.id], consent);
    await kv.set(["gdpr", "consents_by_user", userId, consentType], consent.id);

    if (organizationId) {
      await kv.set(
        ["gdpr", "consents_by_org", organizationId, consent.id],
        consent.id,
      );
    }

    // Log consent event
    await auditLogger.logEvent({
      eventType: granted ? "consent_given" : "consent_withdrawn",
      userId,
      userEmail,
      ipAddress,
      userAgent,
      resource: "consent",
      action: granted ? "grant" : "withdraw",
      details: { consentType, version, source },
      severity: "low",
      category: "data",
      success: true,
      organizationId,
      complianceFlags: ["gdpr", "consent"],
    });

    return consent;
  }

  async getConsentStatus(
    userId: string,
    consentType?: string,
  ): Promise<ConsentRecord[]> {
    const consents: ConsentRecord[] = [];

    if (consentType) {
      const result = await kv.get([
        "gdpr",
        "consents_by_user",
        userId,
        consentType,
      ]);
      if (result.value) {
        const consentResult = await kv.get(["gdpr", "consents", result.value]);
        if (consentResult.value) {
          consents.push(consentResult.value as ConsentRecord);
        }
      }
    } else {
      const iter = kv.list({ prefix: ["gdpr", "consents_by_user", userId] });
      for await (const entry of iter) {
        const consentResult = await kv.get(["gdpr", "consents", entry.value]);
        if (consentResult.value) {
          consents.push(consentResult.value as ConsentRecord);
        }
      }
    }

    return consents;
  }

  // Data Retention Policies
  async createRetentionPolicy(
    dataType: DataRetentionPolicy["dataType"],
    retentionPeriod: number,
    legalBasis: string,
    description: string,
    organizationId?: string,
  ): Promise<DataRetentionPolicy> {
    const policy: DataRetentionPolicy = {
      id: crypto.randomUUID(),
      organizationId,
      dataType,
      retentionPeriod,
      autoDelete: true,
      legalBasis,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
    };

    await kv.set(["gdpr", "retention_policies", policy.id], policy);

    if (organizationId) {
      await kv.set(
        ["gdpr", "retention_by_org", organizationId, policy.id],
        policy.id,
      );
    }

    return policy;
  }

  async enforceRetentionPolicies(): Promise<void> {
    const iter = kv.list({ prefix: ["gdpr", "retention_policies"] });

    for await (const entry of iter) {
      const policy = entry.value as DataRetentionPolicy;
      if (!policy.isActive || !policy.autoDelete) continue;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionPeriod);

      await this.deleteExpiredData(
        policy.dataType,
        cutoffDate.toISOString(),
        policy.organizationId,
      );
    }
  }

  // Privacy Settings Management
  async updatePrivacySettings(
    userId: string,
    settings: Partial<Omit<PrivacySettings, "id" | "userId" | "updatedAt">>,
    organizationId?: string,
  ): Promise<PrivacySettings> {
    const existingResult = await kv.get(["gdpr", "privacy_settings", userId]);
    const existing = existingResult.value as PrivacySettings || {};

    const privacySettings: PrivacySettings = {
      id: existing.id || crypto.randomUUID(),
      userId,
      anonymizeData: settings.anonymizeData ?? existing.anonymizeData ?? false,
      allowAnalytics: settings.allowAnalytics ?? existing.allowAnalytics ??
        false,
      allowMarketing: settings.allowMarketing ?? existing.allowMarketing ??
        false,
      allowProfiling: settings.allowProfiling ?? existing.allowProfiling ??
        false,
      dataPortabilityEnabled: settings.dataPortabilityEnabled ??
        existing.dataPortabilityEnabled ?? true,
      rightToBeForgettenEnabled: settings.rightToBeForgettenEnabled ??
        existing.rightToBeForgettenEnabled ?? true,
      updatedAt: new Date().toISOString(),
      organizationId,
    };

    await kv.set(["gdpr", "privacy_settings", userId], privacySettings);

    return privacySettings;
  }

  // Helper methods for data operations
  private async collectUserData(
    userId: string,
    organizationId?: string,
  ): Promise<Record<string, unknown>> {
    const userData: Record<string, unknown> = {};

    // Collect user profile data
    const userResult = await kv.get(["users", userId]);
    if (userResult.value) {
      userData.profile = userResult.value;
    }

    // Collect user content
    const contentIter = kv.list({ prefix: ["content", "by_author", userId] });
    const content = [];
    for await (const entry of contentIter) {
      const contentResult = await kv.get(["content", entry.value]);
      if (contentResult.value) {
        content.push(contentResult.value);
      }
    }
    userData.content = content;

    // Collect media files
    const mediaIter = kv.list({ prefix: ["media", "by_user", userId] });
    const media = [];
    for await (const entry of mediaIter) {
      const mediaResult = await kv.get(["media", entry.value]);
      if (mediaResult.value) {
        media.push(mediaResult.value);
      }
    }
    userData.media = media;

    // Collect audit logs (last 90 days for privacy)
    const auditLogs = await auditLogger.queryEvents({
      userId,
      startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      organizationId,
      limit: 1000,
    });
    userData.activityLogs = auditLogs;

    return userData;
  }

  private async deleteUserData(
    userId: string,
    organizationId?: string,
  ): Promise<Record<string, unknown>> {
    const deletionResults: Record<string, unknown> = {};

    try {
      // Anonymize user profile
      const userResult = await kv.get(["users", userId]);
      if (userResult.value) {
        const user = userResult.value as any;
        user.email = `deleted-${userId}@anonymized.local`;
        user.name = "Deleted User";
        user.isDeleted = true;
        user.deletedAt = new Date().toISOString();
        await kv.set(["users", userId], user);
        deletionResults.profile = "anonymized";
      }

      // Delete or anonymize content
      const contentIter = kv.list({ prefix: ["content", "by_author", userId] });
      let contentCount = 0;
      for await (const entry of contentIter) {
        await kv.delete(["content", entry.value]);
        contentCount++;
      }
      deletionResults.content = `${contentCount} items deleted`;

      // Delete media files
      const mediaIter = kv.list({ prefix: ["media", "by_user", userId] });
      let mediaCount = 0;
      for await (const entry of mediaIter) {
        await kv.delete(["media", entry.value]);
        mediaCount++;
      }
      deletionResults.media = `${mediaCount} files deleted`;
    } catch (error) {
      deletionResults.error = error.message;
    }

    return deletionResults;
  }

  private async getPortableUserData(
    userId: string,
    organizationId?: string,
  ): Promise<Record<string, unknown>> {
    // Similar to collectUserData but in a portable format
    return await this.collectUserData(userId, organizationId);
  }

  private async updateUserData(
    userId: string,
    updates: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const userResult = await kv.get(["users", userId]);
    if (!userResult.value) {
      throw new Error("User not found");
    }

    const user = { ...userResult.value as any, ...updates };
    user.updatedAt = new Date().toISOString();

    await kv.set(["users", userId], user);

    return { updated: Object.keys(updates), timestamp: user.updatedAt };
  }

  private async restrictUserDataProcessing(
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    // Mark user data as restricted
    const userResult = await kv.get(["users", userId]);
    if (userResult.value) {
      const user = userResult.value as any;
      user.processingRestricted = true;
      user.restrictionAppliedAt = new Date().toISOString();
      await kv.set(["users", userId], user);
    }
  }

  private async getRetainedDataSummary(
    userId: string,
  ): Promise<Record<string, unknown>> {
    return {
      auditLogs: "Retained for 7 years (legal requirement)",
      billing: "Retained for 7 years (tax purposes)",
      essentialProfile: "Anonymized identifier retained",
    };
  }

  private async generateSecureDownloadUrl(
    data: Record<string, unknown>,
    requestId: string,
  ): Promise<string> {
    // In a real implementation, this would generate a secure, time-limited download URL
    // For now, we'll store the data and return a reference
    const downloadId = crypto.randomUUID();
    await kv.set(["gdpr", "downloads", downloadId], {
      data,
      requestId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    });

    return `/api/gdpr/download/${downloadId}`;
  }

  private async deleteExpiredData(
    dataType: string,
    cutoffDate: string,
    organizationId?: string,
  ): Promise<void> {
    // Implementation would depend on the specific data type
    console.log(`Deleting expired ${dataType} data older than ${cutoffDate}`);
  }

  // Compliance Reporting
  async generateComplianceReport(
    organizationId?: string,
  ): Promise<Record<string, unknown>> {
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString(); // Last 30 days

    const gdprRequests = await this.getGDPRRequestsSummary(
      startDate,
      endDate,
      organizationId,
    );
    const consentMetrics = await this.getConsentMetrics(organizationId);
    const retentionCompliance = await this.getRetentionCompliance(
      organizationId,
    );

    return {
      reportPeriod: { startDate, endDate },
      organizationId,
      gdprRequests,
      consentMetrics,
      retentionCompliance,
      generatedAt: new Date().toISOString(),
    };
  }

  private async getGDPRRequestsSummary(
    startDate: string,
    endDate: string,
    organizationId?: string,
  ) {
    const prefix = organizationId
      ? ["gdpr", "by_org", organizationId]
      : ["gdpr", "requests"];

    const requests = [];
    const iter = kv.list({ prefix });

    for await (const entry of iter) {
      let request: GDPRRequest;
      if (organizationId) {
        const requestResult = await kv.get(["gdpr", "requests", entry.value]);
        if (!requestResult.value) continue;
        request = requestResult.value as GDPRRequest;
      } else {
        request = entry.value as GDPRRequest;
      }

      if (request.requestedAt >= startDate && request.requestedAt <= endDate) {
        requests.push(request);
      }
    }

    return {
      total: requests.length,
      byType: this.groupBy(requests, "type"),
      byStatus: this.groupBy(requests, "status"),
      averageProcessingTime: this.calculateAverageProcessingTime(requests),
    };
  }

  private async getConsentMetrics(organizationId?: string) {
    const prefix = organizationId
      ? ["gdpr", "consents_by_org", organizationId]
      : ["gdpr", "consents"];

    const consents = [];
    const iter = kv.list({ prefix });

    for await (const entry of iter) {
      let consent: ConsentRecord;
      if (organizationId) {
        const consentResult = await kv.get(["gdpr", "consents", entry.value]);
        if (!consentResult.value) continue;
        consent = consentResult.value as ConsentRecord;
      } else {
        consent = entry.value as ConsentRecord;
      }

      consents.push(consent);
    }

    return {
      total: consents.length,
      granted: consents.filter((c) => c.granted).length,
      withdrawn: consents.filter((c) => !c.granted).length,
      byType: this.groupBy(consents, "consentType"),
    };
  }

  private async getRetentionCompliance(organizationId?: string) {
    const prefix = organizationId
      ? ["gdpr", "retention_by_org", organizationId]
      : ["gdpr", "retention_policies"];

    const policies = [];
    const iter = kv.list({ prefix });

    for await (const entry of iter) {
      let policy: DataRetentionPolicy;
      if (organizationId) {
        const policyResult = await kv.get([
          "gdpr",
          "retention_policies",
          entry.value,
        ]);
        if (!policyResult.value) continue;
        policy = policyResult.value as DataRetentionPolicy;
      } else {
        policy = entry.value as DataRetentionPolicy;
      }

      policies.push(policy);
    }

    return {
      totalPolicies: policies.length,
      activePolicies: policies.filter((p) => p.isActive).length,
      autoDeleteEnabled: policies.filter((p) => p.autoDelete).length,
      byDataType: this.groupBy(policies, "dataType"),
    };
  }

  private groupBy(array: any[], key: string): Record<string, number> {
    return array.reduce((acc, item) => {
      const group = item[key];
      acc[group] = (acc[group] || 0) + 1;
      return acc;
    }, {});
  }

  private calculateAverageProcessingTime(requests: GDPRRequest[]): number {
    const completedRequests = requests.filter((r) =>
      r.completedAt && r.processedAt
    );
    if (completedRequests.length === 0) return 0;

    const totalTime = completedRequests.reduce((sum, request) => {
      const processTime = new Date(request.completedAt!).getTime() -
        new Date(request.processedAt!).getTime();
      return sum + processTime;
    }, 0);

    return totalTime / completedRequests.length / (1000 * 60 * 60); // Convert to hours
  }
}

export const gdprService = GDPRService.getInstance();
