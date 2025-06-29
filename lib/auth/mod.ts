// Authentication Module
// Main exports for masmaCMS authentication system

export * from "./jwt.ts";
export * from "./password.ts";
export * from "./sessions.ts";
export * from "./rbac.ts";
export * from "./service.ts";
export * from "./middleware.ts";
export * from "./repositories/user.ts";

// Re-export commonly used functions and classes
export {
  createAuthorizationHeader,
  extractBearerToken,
  JWTManager,
} from "./jwt.ts";
export { PasswordManager, PasswordResetManager } from "./password.ts";
export { DeviceFingerprinting, SessionManager } from "./sessions.ts";
export { ALL_PERMISSIONS, DEFAULT_ROLES, RBACManager } from "./rbac.ts";
export { AuthService as default } from "./service.ts";
export {
  createApiKeyAuthMiddleware,
  createAuthMiddleware,
  createCombinedAuthMiddleware,
  getAuthContext,
  getUserId,
  hasPermission,
  hasRole,
} from "./middleware.ts";
export { userRepository } from "./repositories/user.ts";
