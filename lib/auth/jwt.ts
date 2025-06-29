// JWT Token Management
// Secure token generation, validation, and refresh functionality

import { create, decode, type Payload, verify } from "jose";
import type { JWTPayload, JWTTokens, SessionData, UUID } from "@/types";
import { config } from "@/lib/config.ts";

export class JWTManager {
  private static readonly ALGORITHM = "HS256";
  private static readonly ACCESS_TOKEN_EXPIRY = "15m"; // 15 minutes
  private static readonly REFRESH_TOKEN_EXPIRY = "7d"; // 7 days
  private static readonly ISSUER = "masmaCMS";

  private static getSecretKey(): Uint8Array {
    const secret = config.JWT_SECRET ||
      "your-super-secret-jwt-key-change-in-production";
    return new TextEncoder().encode(secret);
  }

  // Generate access and refresh token pair
  static async generateTokens(payload: JWTPayload): Promise<JWTTokens> {
    const secretKey = this.getSecretKey();
    const now = Math.floor(Date.now() / 1000);

    // Access token payload
    const accessPayload = {
      ...payload,
      iss: this.ISSUER,
      iat: now,
      exp: now + (15 * 60), // 15 minutes
      type: "access",
    };

    // Refresh token payload - more limited information
    const refreshPayload = {
      userId: payload.userId,
      sessionId: payload.sessionId,
      iss: this.ISSUER,
      iat: now,
      exp: now + (7 * 24 * 60 * 60), // 7 days
      type: "refresh",
    };

    const [accessToken, refreshToken] = await Promise.all([
      new SignJWT(accessPayload)
        .setProtectedHeader({ alg: this.ALGORITHM })
        .sign(secretKey),
      new SignJWT(refreshPayload)
        .setProtectedHeader({ alg: this.ALGORITHM })
        .sign(secretKey),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: 15 * 60, // 15 minutes in seconds
      expiresAt: now + (15 * 60),
    };
  }

  // Validate and decode access token
  static async validateAccessToken(token: string): Promise<JWTPayload | null> {
    try {
      const secretKey = this.getSecretKey();
      const { payload } = await jwtVerify(token, secretKey, {
        issuer: this.ISSUER,
        algorithms: [this.ALGORITHM],
      });

      // Verify it's an access token
      if (payload.type !== "access") {
        throw new Error("Invalid token type");
      }

      return payload as unknown as JWTPayload;
    } catch (error) {
      console.error("JWT validation failed:", error.message);
      return null;
    }
  }

  // Validate refresh token
  static async validateRefreshToken(
    token: string,
  ): Promise<{ userId: UUID; sessionId: UUID } | null> {
    try {
      const secretKey = this.getSecretKey();
      const { payload } = await jwtVerify(token, secretKey, {
        issuer: this.ISSUER,
        algorithms: [this.ALGORITHM],
      });

      // Verify it's a refresh token
      if (payload.type !== "refresh") {
        throw new Error("Invalid token type");
      }

      return {
        userId: payload.userId as UUID,
        sessionId: payload.sessionId as UUID,
      };
    } catch (error) {
      console.error("Refresh token validation failed:", error.message);
      return null;
    }
  }

  // Decode token without verification (for debugging)
  static decodeToken(token: string): Payload | null {
    try {
      return decodeJwt(token);
    } catch (error) {
      return null;
    }
  }

  // Check if token is expired
  static isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    return decoded.exp < now;
  }

  // Get token expiration time
  static getTokenExpiration(token: string): Date | null {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return null;
    }

    return new Date(decoded.exp * 1000);
  }

  // Refresh access token using refresh token
  static async refreshAccessToken(
    refreshToken: string,
    sessionData: SessionData,
  ): Promise<JWTTokens | null> {
    const refreshPayload = await this.validateRefreshToken(refreshToken);
    if (!refreshPayload) {
      return null;
    }

    // Create new JWT payload from session data
    const jwtPayload: JWTPayload = {
      userId: sessionData.userId,
      sessionId: sessionData.id,
      email: sessionData.user?.email,
      username: sessionData.user?.username,
      roles: sessionData.user?.roles || [],
      permissions: sessionData.permissions || [],
      teamId: sessionData.user?.activeTeamId,
      locale: sessionData.user?.locale || "en",
    };

    return await this.generateTokens(jwtPayload);
  }

  // Blacklist token (would need to be stored in database)
  static async blacklistToken(token: string): Promise<void> {
    // TODO: Implement token blacklisting in database
    // For now, we rely on short expiration times
    console.log("Token blacklisted:", token.substring(0, 20) + "...");
  }

  // Generate secure random string for additional security
  static generateSecureRandom(length = 32): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const randomArray = new Uint8Array(length);
    crypto.getRandomValues(randomArray);

    for (let i = 0; i < length; i++) {
      result += chars[randomArray[i] % chars.length];
    }

    return result;
  }
}

// Import necessary functions from jose (needed for the above code to work)
import { decodeJwt, jwtVerify, SignJWT } from "jose";

// Helper function to extract token from Authorization header
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}

// Helper function to create Authorization header
export function createAuthorizationHeader(token: string): string {
  return `Bearer ${token}`;
}
