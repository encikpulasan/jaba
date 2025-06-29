// Authentication Service
// Main authentication logic with login, registration, and session management

import type {
  DeviceInfo,
  JWTPayload,
  JWTTokens,
  LoginRequest,
  RegisterRequest,
  SessionData,
  User,
  UUID,
} from "@/types";
import { userRepository } from "./repositories/user.ts";
import { JWTManager } from "./jwt.ts";
import { DeviceFingerprinting, SessionManager } from "./sessions.ts";
import { PasswordManager } from "./password.ts";
import { RBACManager } from "./rbac.ts";

export class AuthService {
  // Register new user
  static async register(
    registrationData: RegisterRequest,
    deviceInfo: DeviceInfo,
    ipAddress: string,
  ): Promise<{ user: User; tokens: JWTTokens; session: SessionData }> {
    // Validate password
    const passwordValidation = PasswordManager.validatePassword(
      registrationData.password,
      {},
      {
        email: registrationData.email,
        username: registrationData.username,
        firstName: registrationData.firstName,
        lastName: registrationData.lastName,
      },
    );

    if (!passwordValidation.isValid) {
      throw new Error(
        `Password validation failed: ${passwordValidation.errors.join(", ")}`,
      );
    }

    // Create user
    const user = await userRepository.createUser(
      {
        email: registrationData.email,
        username: registrationData.username,
        firstName: registrationData.firstName,
        lastName: registrationData.lastName,
        locale: registrationData.locale || "en",
        timezone: registrationData.timezone || "UTC",
      },
      registrationData.password,
    );

    // Assign default role
    const viewerRole = await RBACManager.getRoleByName("Viewer");
    if (viewerRole) {
      await RBACManager.assignRoleToUser(user.id, viewerRole.id);
    }

    // Create session
    const session = await SessionManager.createSession(
      user.id,
      deviceInfo,
      ipAddress,
    );

    // Generate tokens
    const userRoles = await RBACManager.getUserRoles(user.id);
    const permissions = await RBACManager.getUserPermissions(user.id);

    const jwtPayload = {
      userId: user.id,
      sessionId: session.id,
      email: user.email,
      username: user.username,
      roles: userRoles.map((r) => r.name),
      permissions,
      locale: user.locale,
    };

    const tokens = await JWTManager.generateTokens(jwtPayload);

    // Log registration activity
    await SessionManager.updateActivity(session.id, {
      type: "login",
      description: "User registered and logged in",
      ipAddress,
    });

    return { user, tokens, session };
  }

  // Login user
  static async login(
    loginData: LoginRequest,
    deviceInfo: DeviceInfo,
    ipAddress: string,
  ): Promise<{ user: User; tokens: JWTTokens; session: SessionData }> {
    // Find user by email or username
    let user: User | null = null;

    if (loginData.email) {
      user = await userRepository.findByEmail(loginData.email);
    } else if (loginData.username) {
      user = await userRepository.findByUsername(loginData.username);
    }

    if (!user) {
      throw new Error("Invalid credentials");
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error("Account is deactivated");
    }

    // Verify password
    const isValidPassword = await userRepository.verifyPassword(
      user.id,
      loginData.password,
    );
    if (!isValidPassword) {
      throw new Error("Invalid credentials");
    }

    // Check password expiration
    if (user.passwordChangedAt) {
      const isExpired = PasswordManager.isPasswordExpired(
        new Date(user.passwordChangedAt),
        90, // 90 days
      );
      if (isExpired) {
        throw new Error("Password has expired. Please reset your password.");
      }
    }

    // Create session
    const session = await SessionManager.createSession(
      user.id,
      deviceInfo,
      ipAddress,
    );

    // Generate tokens
    const userRoles = await RBACManager.getUserRoles(user.id);
    const permissions = await RBACManager.getUserPermissions(user.id);

    const jwtPayload = {
      userId: user.id,
      sessionId: session.id,
      email: user.email,
      username: user.username,
      roles: userRoles.map((r) => r.name),
      permissions,
      locale: user.locale,
    };

    const tokens = await JWTManager.generateTokens(jwtPayload);

    // Update last login
    await userRepository.update(user.id, {
      lastLoginAt: Date.now(),
      lastLoginIp: ipAddress,
    });

    // Log login activity
    await SessionManager.updateActivity(session.id, {
      type: "login",
      description: "User logged in",
      ipAddress,
    });

    return { user, tokens, session };
  }

  // Refresh access token
  static async refreshToken(
    refreshToken: string,
  ): Promise<{ tokens: JWTTokens; session: SessionData } | null> {
    // Validate refresh token
    const refreshPayload = await JWTManager.validateRefreshToken(refreshToken);
    if (!refreshPayload) {
      return null;
    }

    // Get and validate session
    const session = await SessionManager.validateAndExtendSession(
      refreshPayload.sessionId,
    );
    if (!session) {
      return null;
    }

    // Get user and their current permissions
    const user = await userRepository.findById(session.userId);
    if (!user || !user.isActive) {
      return null;
    }

    const userRoles = await RBACManager.getUserRoles(user.id);
    const permissions = await RBACManager.getUserPermissions(user.id);

    // Create updated session data
    const sessionData: SessionData = {
      ...session,
      user,
      permissions,
    };

    // Generate new tokens
    const tokens = await JWTManager.refreshAccessToken(
      refreshToken,
      sessionData,
    );
    if (!tokens) {
      return null;
    }

    // Log token refresh activity
    await SessionManager.updateActivity(session.id, {
      type: "api_call",
      description: "Token refreshed",
    });

    return { tokens, session: sessionData };
  }

  // Logout user
  static async logout(sessionId: UUID): Promise<boolean> {
    // Log logout activity
    await SessionManager.updateActivity(sessionId, {
      type: "logout",
      description: "User logged out",
    });

    // Destroy session
    return await SessionManager.destroySession(sessionId);
  }

  // Logout from all devices
  static async logoutAllDevices(
    userId: UUID,
    currentSessionId?: UUID,
  ): Promise<number> {
    return await SessionManager.destroyAllUserSessions(
      userId,
      currentSessionId,
    );
  }

  // Validate current session
  static async validateSession(sessionId: UUID): Promise<SessionData | null> {
    const session = await SessionManager.getSession(sessionId);
    if (!session) {
      return null;
    }

    // Get user and permissions
    const user = await userRepository.findById(session.userId);
    if (!user || !user.isActive) {
      await SessionManager.destroySession(sessionId);
      return null;
    }

    const permissions = await RBACManager.getUserPermissions(user.id);

    return {
      ...session,
      user,
      permissions,
    };
  }

  // Change password
  static async changePassword(
    userId: UUID,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    // Verify current password
    const isValid = await userRepository.verifyPassword(
      userId,
      currentPassword,
    );
    if (!isValid) {
      throw new Error("Current password is incorrect");
    }

    // Validate new password
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const passwordValidation = PasswordManager.validatePassword(
      newPassword,
      {},
      {
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    );

    if (!passwordValidation.isValid) {
      throw new Error(
        `Password validation failed: ${passwordValidation.errors.join(", ")}`,
      );
    }

    // Update password
    return await userRepository.updatePassword(userId, newPassword, userId);
  }

  // Request password reset
  static async requestPasswordReset(
    email: string,
  ): Promise<{ token: string; expiresAt: Date } | null> {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists for security
      return null;
    }

    // Generate reset token
    const { token, expiresAt } = PasswordManager.generateResetToken();

    // Store reset token (in a real implementation, this would be stored in the database)
    // For now, we'll return it directly
    console.log(`Password reset token for ${email}: ${token}`);

    return { token, expiresAt };
  }

  // Reset password with token
  static async resetPassword(
    token: string,
    newPassword: string,
    email: string,
  ): Promise<boolean> {
    // In a real implementation, you would validate the token from the database
    // For now, we'll just validate the password and update it

    const user = await userRepository.findByEmail(email);
    if (!user) {
      return false;
    }

    // Validate new password
    const passwordValidation = PasswordManager.validatePassword(
      newPassword,
      {},
      {
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    );

    if (!passwordValidation.isValid) {
      throw new Error(
        `Password validation failed: ${passwordValidation.errors.join(", ")}`,
      );
    }

    // Update password
    return await userRepository.updatePassword(user.id, newPassword);
  }

  // Get user profile
  static async getUserProfile(userId: UUID): Promise<User | null> {
    return await userRepository.findById(userId);
  }

  // Update user profile
  static async updateUserProfile(
    userId: UUID,
    updates: Partial<
      Pick<User, "firstName" | "lastName" | "timezone" | "locale">
    >,
    currentUserId?: UUID,
  ): Promise<User | null> {
    return await userRepository.update(userId, updates, currentUserId);
  }

  // Get user sessions
  static async getUserSessions(userId: UUID): Promise<SessionData[]> {
    return await SessionManager.getUserSessions(userId);
  }

  // Get session statistics
  static async getSessionStats() {
    return await SessionManager.getSessionStats();
  }

  // Validate JWT token (alias for validateToken)
  static async validateJWT(token: string): Promise<{
    isValid: boolean;
    payload?: JWTPayload;
    reason?: string;
  }> {
    return await this.validateToken(token);
  }
}

// Export authentication service
export { AuthService as default };
