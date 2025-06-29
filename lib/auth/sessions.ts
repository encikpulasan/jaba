// Session Management
// Secure session handling with device tracking and security monitoring

import type {
  DeviceInfo,
  Session,
  SessionActivity,
  SessionData,
  UUID,
} from "@/types";
import { db } from "@/lib/db/mod.ts";
import { KeyPatterns } from "@/lib/db/patterns.ts";
import { JWTManager } from "./jwt.ts";

export class SessionManager {
  private static readonly SESSION_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days
  private static readonly MAX_SESSIONS_PER_USER = 10;
  private static readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

  // Create new session
  static async createSession(
    userId: UUID,
    deviceInfo: DeviceInfo,
    ipAddress: string,
  ): Promise<SessionData> {
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + this.SESSION_EXPIRY;

    const session: SessionData = {
      id: sessionId,
      userId,
      deviceInfo,
      ipAddress,
      createdAt: now,
      lastActivityAt: now,
      expiresAt,
      isActive: true,
      activities: [],
    };

    // Store session in database
    const connection = db.getConnection();
    const atomic = (connection.kv as Deno.Kv).atomic();

    // Store session by ID
    atomic.set(KeyPatterns.sessions.byId(sessionId), session);

    // Store session by user for easy lookup
    atomic.set(KeyPatterns.sessions.byUserId(userId), sessionId);

    // Add to active sessions list
    const activeSessionsKey = [
      ...KeyPatterns.sessions.active(),
      userId,
      sessionId,
    ];
    atomic.set(activeSessionsKey, true);

    await atomic.commit();

    // Clean up old sessions for this user
    await this.cleanupOldSessions(userId);

    return session;
  }

  // Get session by ID
  static async getSession(sessionId: UUID): Promise<SessionData | null> {
    const connection = db.getConnection();
    const result = await (connection.kv as Deno.Kv).get<SessionData>(
      KeyPatterns.sessions.byId(sessionId),
    );

    if (!result.value) {
      return null;
    }

    const session = result.value;

    // Check if session is expired
    if (session.expiresAt < Date.now() || !session.isActive) {
      await this.destroySession(sessionId);
      return null;
    }

    return session;
  }

  // Update session activity
  static async updateActivity(
    sessionId: UUID,
    activity: Omit<SessionActivity, "timestamp">,
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return;
    }

    const now = Date.now();
    const sessionActivity: SessionActivity = {
      ...activity,
      timestamp: now,
    };

    // Update session
    const updatedSession: SessionData = {
      ...session,
      lastActivityAt: now,
      activities: [...session.activities.slice(-49), sessionActivity], // Keep last 50 activities
    };

    // Store updated session
    const connection = db.getConnection();
    await (connection.kv as Deno.Kv).set(
      KeyPatterns.sessions.byId(sessionId),
      updatedSession,
    );
  }

  // Validate session and extend if needed
  static async validateAndExtendSession(
    sessionId: UUID,
  ): Promise<SessionData | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const now = Date.now();

    // Extend session if it's still active and not expired
    if (session.isActive && session.expiresAt > now) {
      const newExpiresAt = now + this.SESSION_EXPIRY;

      const updatedSession: SessionData = {
        ...session,
        lastActivityAt: now,
        expiresAt: newExpiresAt,
      };

      // Update in database
      const connection = db.getConnection();
      await (connection.kv as Deno.Kv).set(
        KeyPatterns.sessions.byId(sessionId),
        updatedSession,
      );

      return updatedSession;
    }

    return null;
  }

  // Get all active sessions for a user
  static async getUserSessions(userId: UUID): Promise<SessionData[]> {
    const connection = db.getConnection();
    const sessions: SessionData[] = [];

    // Get all sessions for user
    const iterator = (connection.kv as Deno.Kv).list<boolean>({
      prefix: [...KeyPatterns.sessions.active(), userId],
    });

    for await (const { key } of iterator) {
      const sessionId = key[key.length - 1] as UUID;
      const session = await this.getSession(sessionId);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  }

  // Destroy session
  static async destroySession(sessionId: UUID): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return false;
    }

    const connection = db.getConnection();
    const atomic = (connection.kv as Deno.Kv).atomic();

    // Remove session
    atomic.delete(KeyPatterns.sessions.byId(sessionId));

    // Remove from active sessions
    const activeSessionKey = [
      ...KeyPatterns.sessions.active(),
      session.userId,
      sessionId,
    ];
    atomic.delete(activeSessionKey);

    await atomic.commit();
    return true;
  }

  // Destroy all sessions for a user
  static async destroyAllUserSessions(
    userId: UUID,
    except?: UUID,
  ): Promise<number> {
    const sessions = await this.getUserSessions(userId);
    let destroyedCount = 0;

    for (const session of sessions) {
      if (session.id !== except) {
        const destroyed = await this.destroySession(session.id);
        if (destroyed) {
          destroyedCount++;
        }
      }
    }

    return destroyedCount;
  }

  // Clean up old sessions for a user (keep only the most recent ones)
  private static async cleanupOldSessions(userId: UUID): Promise<void> {
    const sessions = await this.getUserSessions(userId);

    if (sessions.length > this.MAX_SESSIONS_PER_USER) {
      // Sort by last activity (newest first)
      sessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt);

      // Remove old sessions beyond the limit
      const sessionsToRemove = sessions.slice(this.MAX_SESSIONS_PER_USER);

      for (const session of sessionsToRemove) {
        await this.destroySession(session.id);
      }
    }
  }

  // Clean up expired sessions (background task)
  static async cleanupExpiredSessions(): Promise<number> {
    const connection = db.getConnection();
    const now = Date.now();
    let cleanedCount = 0;

    // Get all active sessions
    const iterator = (connection.kv as Deno.Kv).list<SessionData>({
      prefix: KeyPatterns.sessions.all(),
    });

    const expiredSessions: UUID[] = [];

    for await (const { value } of iterator) {
      if (value && (value.expiresAt < now || !value.isActive)) {
        expiredSessions.push(value.id);
      }
    }

    // Remove expired sessions
    for (const sessionId of expiredSessions) {
      const destroyed = await this.destroySession(sessionId);
      if (destroyed) {
        cleanedCount++;
      }
    }

    console.log(`🧹 Cleaned up ${cleanedCount} expired sessions`);
    return cleanedCount;
  }

  // Get session statistics
  static async getSessionStats(): Promise<{
    totalActive: number;
    byDevice: Record<string, number>;
    recentActivity: number;
  }> {
    const connection = db.getConnection();
    const stats = {
      totalActive: 0,
      byDevice: {} as Record<string, number>,
      recentActivity: 0,
    };

    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    // Count all active sessions
    const iterator = (connection.kv as Deno.Kv).list<SessionData>({
      prefix: KeyPatterns.sessions.all(),
    });

    for await (const { value } of iterator) {
      if (value && value.isActive && value.expiresAt > Date.now()) {
        stats.totalActive++;

        // Count by device type
        const deviceType = value.deviceInfo.type || "unknown";
        stats.byDevice[deviceType] = (stats.byDevice[deviceType] || 0) + 1;

        // Count recent activity
        if (value.lastActivityAt > oneHourAgo) {
          stats.recentActivity++;
        }
      }
    }

    return stats;
  }

  // Start automatic cleanup task
  static startCleanupTask(): void {
    setInterval(async () => {
      try {
        await this.cleanupExpiredSessions();
      } catch (error) {
        console.error("Session cleanup failed:", error);
      }
    }, this.CLEANUP_INTERVAL);

    console.log("🕐 Session cleanup task started");
  }

  // Detect suspicious activity
  static detectSuspiciousActivity(session: SessionData): {
    isSuspicious: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];
    let isSuspicious = false;

    // Check for multiple IP addresses
    const recentActivities = session.activities.slice(-10);
    const uniqueIPs = new Set(
      recentActivities
        .filter((a) => a.ipAddress)
        .map((a) => a.ipAddress),
    );

    if (uniqueIPs.size > 3) {
      reasons.push("Multiple IP addresses detected");
      isSuspicious = true;
    }

    // Check for rapid location changes
    const locations = recentActivities
      .filter((a) => a.location)
      .map((a) => a.location);

    if (locations.length > 1) {
      // Simple check for different countries/cities
      const uniqueLocations = new Set(
        locations.map((l) => `${l!.country}-${l!.city}`),
      );
      if (uniqueLocations.size > 2) {
        reasons.push("Rapid location changes detected");
        isSuspicious = true;
      }
    }

    // Check for unusual activity patterns
    const now = Date.now();
    const recentActivityCount = session.activities
      .filter((a) => now - a.timestamp < 10 * 60 * 1000) // Last 10 minutes
      .length;

    if (recentActivityCount > 50) {
      reasons.push("Unusually high activity rate");
      isSuspicious = true;
    }

    return { isSuspicious, reasons };
  }
}

// Device fingerprinting utilities
export class DeviceFingerprinting {
  // Generate device fingerprint from request headers
  static generateFingerprint(headers: Headers): string {
    const components = [
      headers.get("user-agent") || "",
      headers.get("accept-language") || "",
      headers.get("accept-encoding") || "",
      headers.get("accept") || "",
    ];

    const fingerprint = components.join("|");
    return this.hashString(fingerprint);
  }

  // Parse device info from user agent
  static parseDeviceInfo(userAgent: string): DeviceInfo {
    const ua = userAgent.toLowerCase();

    let type: DeviceInfo["type"] = "desktop";
    let os = "unknown";
    let browser = "unknown";

    // Detect device type
    if (
      ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")
    ) {
      type = "mobile";
    } else if (ua.includes("tablet") || ua.includes("ipad")) {
      type = "tablet";
    }

    // Detect OS
    if (ua.includes("windows")) os = "Windows";
    else if (ua.includes("mac")) os = "macOS";
    else if (ua.includes("linux")) os = "Linux";
    else if (ua.includes("android")) os = "Android";
    else if (
      ua.includes("ios") || ua.includes("iphone") || ua.includes("ipad")
    ) os = "iOS";

    // Detect browser
    if (ua.includes("chrome")) browser = "Chrome";
    else if (ua.includes("firefox")) browser = "Firefox";
    else if (ua.includes("safari")) browser = "Safari";
    else if (ua.includes("edge")) browser = "Edge";
    else if (ua.includes("opera")) browser = "Opera";

    return {
      type,
      os,
      browser,
      userAgent,
      fingerprint: this.generateFingerprint(
        new Headers({ "user-agent": userAgent }),
      ),
    };
  }

  // Simple hash function for fingerprinting
  private static hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}
