// OAuth Integration System
// Handles OAuth authentication with multiple providers

import type { DeviceInfo, User, UUID } from "@/types";
import { userRepository } from "./repositories/user.ts";
import { AuthService } from "./service.ts";
import { JWTManager } from "./jwt.ts";
import { SessionManager } from "./sessions.ts";

export interface OAuthProvider {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string[];
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  enabled: boolean;
}

export interface OAuthProfile {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  avatar?: string;
  locale?: string;
  provider: string;
  providerData: Record<string, unknown>;
}

export interface OAuthAccount {
  id: UUID;
  userId: UUID;
  provider: string;
  providerId: string;
  email: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope: string[];
  createdAt: number;
  updatedAt: number;
}

export class OAuthManager {
  private static providers: Map<string, OAuthProvider> = new Map();

  // Initialize OAuth providers
  static initialize(providers: OAuthProvider[]): void {
    for (const provider of providers) {
      if (provider.enabled) {
        this.providers.set(provider.id, provider);
      }
    }
    console.log(`🔗 OAuth initialized with ${this.providers.size} providers`);
  }

  // Get OAuth authorization URL
  static getAuthorizationUrl(
    providerId: string,
    state: string,
    additionalParams?: Record<string, string>,
  ): string {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`OAuth provider ${providerId} not found`);
    }

    const params = new URLSearchParams({
      client_id: provider.clientId,
      redirect_uri: provider.redirectUri,
      scope: provider.scope.join(" "),
      response_type: "code",
      state,
      ...additionalParams,
    });

    return `${provider.authUrl}?${params.toString()}`;
  }

  // Exchange authorization code for access token
  static async exchangeCodeForToken(
    providerId: string,
    code: string,
    state: string,
  ): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  }> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`OAuth provider ${providerId} not found`);
    }

    const tokenResponse = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        code,
        redirect_uri: provider.redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(
        `Failed to exchange code for token: ${tokenResponse.statusText}`,
      );
    }

    return await tokenResponse.json();
  }

  // Get user profile from OAuth provider
  static async getUserProfile(
    providerId: string,
    accessToken: string,
  ): Promise<OAuthProfile> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`OAuth provider ${providerId} not found`);
    }

    const profileResponse = await fetch(provider.userInfoUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
    });

    if (!profileResponse.ok) {
      throw new Error(
        `Failed to get user profile: ${profileResponse.statusText}`,
      );
    }

    const profileData = await profileResponse.json();
    return this.normalizeProfile(providerId, profileData);
  }

  // Normalize profile data from different providers
  private static normalizeProfile(providerId: string, data: any): OAuthProfile {
    switch (providerId) {
      case "google":
        return {
          id: data.sub || data.id,
          email: data.email,
          name: data.name,
          firstName: data.given_name,
          lastName: data.family_name,
          avatar: data.picture,
          locale: data.locale,
          provider: providerId,
          providerData: data,
        };

      case "github":
        return {
          id: String(data.id),
          email: data.email,
          name: data.name || data.login,
          username: data.login,
          avatar: data.avatar_url,
          provider: providerId,
          providerData: data,
        };

      case "microsoft":
        return {
          id: data.id,
          email: data.mail || data.userPrincipalName,
          name: data.displayName,
          firstName: data.givenName,
          lastName: data.surname,
          provider: providerId,
          providerData: data,
        };

      default:
        // Generic normalization
        return {
          id: data.id || data.sub,
          email: data.email,
          name: data.name || data.display_name,
          firstName: data.first_name || data.given_name,
          lastName: data.last_name || data.family_name,
          username: data.username || data.preferred_username,
          avatar: data.avatar || data.picture,
          locale: data.locale,
          provider: providerId,
          providerData: data,
        };
    }
  }

  // Handle OAuth login/registration
  static async handleOAuthCallback(
    providerId: string,
    code: string,
    state: string,
    deviceInfo: DeviceInfo,
    ipAddress: string,
  ): Promise<{
    user: User;
    tokens: { access: string; refresh: string };
    session: any;
    isNewUser: boolean;
  }> {
    // Exchange code for token
    const tokenData = await this.exchangeCodeForToken(providerId, code, state);

    // Get user profile
    const profile = await this.getUserProfile(
      providerId,
      tokenData.access_token,
    );

    // Check if user exists
    let user = await userRepository.findByEmail(profile.email);
    let isNewUser = false;

    if (!user) {
      // Create new user
      user = await userRepository.createUser({
        email: profile.email,
        username: profile.username || profile.email.split("@")[0],
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        locale: profile.locale || "en",
        timezone: "UTC",
        avatar: profile.avatar,
      });
      isNewUser = true;
    }

    // Store or update OAuth account
    await this.storeOAuthAccount(user.id, {
      provider: providerId,
      providerId: profile.id,
      email: profile.email,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: tokenData.expires_in
        ? Date.now() + (tokenData.expires_in * 1000)
        : undefined,
      scope: tokenData.scope ? tokenData.scope.split(" ") : [],
    });

    // Create session using existing auth service
    const session = await SessionManager.createSession(
      user.id,
      deviceInfo,
      ipAddress,
    );

    // Generate JWT tokens
    const jwtPayload = {
      userId: user.id,
      sessionId: session.id,
      email: user.email,
      username: user.username,
      roles: [], // Will be populated by existing role system
      permissions: [],
      locale: user.locale,
    };

    const tokens = await JWTManager.generateTokens(jwtPayload);

    return { user, tokens, session, isNewUser };
  }

  // Store OAuth account information
  private static async storeOAuthAccount(
    userId: UUID,
    accountData: Omit<
      OAuthAccount,
      "id" | "userId" | "createdAt" | "updatedAt"
    >,
  ): Promise<void> {
    const accountId = crypto.randomUUID();
    const now = Date.now();

    const account: OAuthAccount = {
      id: accountId,
      userId,
      ...accountData,
      createdAt: now,
      updatedAt: now,
    };

    // Store account (you would implement the storage logic based on your KV patterns)
    // For now, this is a placeholder
    console.log(
      `Stored OAuth account for user ${userId} with provider ${accountData.provider}`,
    );
  }

  // Get supported OAuth providers
  static getSupportedProviders(): Array<{
    id: string;
    name: string;
    enabled: boolean;
  }> {
    return Array.from(this.providers.values()).map((provider) => ({
      id: provider.id,
      name: provider.name,
      enabled: provider.enabled,
    }));
  }

  // Revoke OAuth access
  static async revokeAccess(
    userId: UUID,
    providerId: string,
  ): Promise<boolean> {
    // Implementation would remove stored OAuth tokens
    // This is a placeholder
    console.log(
      `Revoked OAuth access for user ${userId} with provider ${providerId}`,
    );
    return true;
  }
}

// Default OAuth provider configurations
export const defaultOAuthProviders: OAuthProvider[] = [
  {
    id: "google",
    name: "Google",
    clientId: Deno.env.get("GOOGLE_CLIENT_ID") || "",
    clientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
    redirectUri: Deno.env.get("GOOGLE_REDIRECT_URI") ||
      "/auth/oauth/google/callback",
    scope: ["openid", "email", "profile"],
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    enabled:
      !!(Deno.env.get("GOOGLE_CLIENT_ID") &&
        Deno.env.get("GOOGLE_CLIENT_SECRET")),
  },
  {
    id: "github",
    name: "GitHub",
    clientId: Deno.env.get("GITHUB_CLIENT_ID") || "",
    clientSecret: Deno.env.get("GITHUB_CLIENT_SECRET") || "",
    redirectUri: Deno.env.get("GITHUB_REDIRECT_URI") ||
      "/auth/oauth/github/callback",
    scope: ["user:email"],
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    enabled:
      !!(Deno.env.get("GITHUB_CLIENT_ID") &&
        Deno.env.get("GITHUB_CLIENT_SECRET")),
  },
  {
    id: "microsoft",
    name: "Microsoft",
    clientId: Deno.env.get("MICROSOFT_CLIENT_ID") || "",
    clientSecret: Deno.env.get("MICROSOFT_CLIENT_SECRET") || "",
    redirectUri: Deno.env.get("MICROSOFT_REDIRECT_URI") ||
      "/auth/oauth/microsoft/callback",
    scope: ["openid", "email", "profile"],
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfoUrl: "https://graph.microsoft.com/v1.0/me",
    enabled:
      !!(Deno.env.get("MICROSOFT_CLIENT_ID") &&
        Deno.env.get("MICROSOFT_CLIENT_SECRET")),
  },
];

export default OAuthManager;
