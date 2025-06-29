// Password Management
// Secure password hashing, validation, and policy enforcement

import * as bcrypt from "bcrypt";
import type { PasswordPolicy, PasswordValidationResult } from "@/types";

export class PasswordManager {
  private static readonly SALT_ROUNDS = 12;

  // Default password policy
  private static readonly DEFAULT_POLICY: PasswordPolicy = {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    disallowCommonPasswords: true,
    disallowPersonalInfo: true,
    maxConsecutiveChars: 3,
    passwordHistory: 5, // Remember last 5 passwords
    expirationDays: 90, // Password expires after 90 days
  };

  // Common weak passwords (simplified list)
  private static readonly COMMON_PASSWORDS = new Set([
    "password",
    "123456",
    "password123",
    "admin",
    "qwerty",
    "letmein",
    "welcome",
    "monkey",
    "dragon",
    "master",
    "football",
    "baseball",
    "superman",
    "batman",
    "trustno1",
    "hello",
    "welcome123",
    "login",
    "passw0rd",
    "password1",
    "123456789",
    "12345678",
    "1234567890",
  ]);

  // Hash password securely
  static async hashPassword(password: string): Promise<string> {
    return await hash(password, this.SALT_ROUNDS);
  }

  // Verify password against hash
  static async verifyPassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    try {
      return await verify(password, hashedPassword);
    } catch (error) {
      console.error("Password verification failed:", error);
      return false;
    }
  }

  // Validate password against policy
  static validatePassword(
    password: string,
    policy: Partial<PasswordPolicy> = {},
    userInfo?: {
      email?: string;
      username?: string;
      firstName?: string;
      lastName?: string;
    },
  ): PasswordValidationResult {
    const appliedPolicy = { ...this.DEFAULT_POLICY, ...policy };
    const errors: string[] = [];
    const warnings: string[] = [];

    // Length validation
    if (password.length < appliedPolicy.minLength) {
      errors.push(
        `Password must be at least ${appliedPolicy.minLength} characters long`,
      );
    }
    if (password.length > appliedPolicy.maxLength) {
      errors.push(
        `Password must be no more than ${appliedPolicy.maxLength} characters long`,
      );
    }

    // Character requirements
    if (appliedPolicy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }
    if (appliedPolicy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    }
    if (appliedPolicy.requireNumbers && !/\d/.test(password)) {
      errors.push("Password must contain at least one number");
    }
    if (
      appliedPolicy.requireSpecialChars &&
      !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    ) {
      errors.push("Password must contain at least one special character");
    }

    // Common password check
    if (appliedPolicy.disallowCommonPasswords) {
      const lowerPassword = password.toLowerCase();
      if (this.COMMON_PASSWORDS.has(lowerPassword)) {
        errors.push("Password is too common and easily guessable");
      }

      // Check for common patterns
      if (/^(123|abc|qwe)/i.test(password)) {
        errors.push("Password contains common sequential patterns");
      }
    }

    // Personal information check
    if (appliedPolicy.disallowPersonalInfo && userInfo) {
      const lowerPassword = password.toLowerCase();
      const personalInfo = [
        userInfo.email?.split("@")[0],
        userInfo.username,
        userInfo.firstName,
        userInfo.lastName,
      ].filter(Boolean).map((info) => info!.toLowerCase());

      for (const info of personalInfo) {
        if (lowerPassword.includes(info)) {
          errors.push("Password should not contain personal information");
          break;
        }
      }
    }

    // Consecutive characters check
    if (appliedPolicy.maxConsecutiveChars) {
      if (
        this.hasConsecutiveChars(password, appliedPolicy.maxConsecutiveChars)
      ) {
        errors.push(
          `Password should not have more than ${appliedPolicy.maxConsecutiveChars} consecutive identical characters`,
        );
      }
    }

    // Calculate password strength
    const strength = this.calculatePasswordStrength(password);

    if (strength < 3) {
      warnings.push(
        "Password strength is weak, consider using a stronger password",
      );
    } else if (strength < 4) {
      warnings.push(
        "Password strength is moderate, consider adding more complexity",
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      strength,
      score: Math.max(0, 100 - (errors.length * 20) - (warnings.length * 10)),
    };
  }

  // Check password history
  static async isPasswordInHistory(
    password: string,
    passwordHistory: string[],
    historyLimit: number,
  ): Promise<boolean> {
    const recentPasswords = passwordHistory.slice(-historyLimit);

    for (const oldPassword of recentPasswords) {
      if (await this.verifyPassword(password, oldPassword)) {
        return true;
      }
    }

    return false;
  }

  // Generate secure password
  static generateSecurePassword(length: number = 16): string {
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const specialChars = "!@#$%^&*()_+-=[]{}|;:,.<>?";

    const allChars = uppercase + lowercase + numbers + specialChars;
    let password = "";

    // Ensure at least one character from each required set
    password += this.getRandomChar(uppercase);
    password += this.getRandomChar(lowercase);
    password += this.getRandomChar(numbers);
    password += this.getRandomChar(specialChars);

    // Fill the rest randomly
    for (let i = 4; i < length; i++) {
      password += this.getRandomChar(allChars);
    }

    // Shuffle the password
    return this.shuffleString(password);
  }

  // Check if password is expired
  static isPasswordExpired(
    passwordCreatedAt: Date,
    expirationDays: number,
  ): boolean {
    if (expirationDays <= 0) return false;

    const expirationDate = new Date(passwordCreatedAt);
    expirationDate.setDate(expirationDate.getDate() + expirationDays);

    return new Date() > expirationDate;
  }

  // Calculate password strength (0-5 scale)
  private static calculatePasswordStrength(password: string): number {
    let score = 0;

    // Length bonus
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;

    // Character variety
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;

    // Complexity patterns
    if (
      password.length > 10 &&
      /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/.test(password)
    ) {
      score++;
    }

    return Math.min(score, 5);
  }

  // Check for consecutive identical characters
  private static hasConsecutiveChars(
    password: string,
    maxConsecutive: number,
  ): boolean {
    let count = 1;

    for (let i = 1; i < password.length; i++) {
      if (password[i] === password[i - 1]) {
        count++;
        if (count > maxConsecutive) {
          return true;
        }
      } else {
        count = 1;
      }
    }

    return false;
  }

  // Get random character from string
  private static getRandomChar(chars: string): string {
    const randomIndex = Math.floor(Math.random() * chars.length);
    return chars[randomIndex];
  }

  // Shuffle string characters
  private static shuffleString(str: string): string {
    const arr = str.split("");
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join("");
  }
}

// Password reset token management
export class PasswordResetManager {
  private static readonly TOKEN_EXPIRY = 1 * 60 * 60 * 1000; // 1 hour in milliseconds

  // Generate password reset token
  static generateResetToken(): { token: string; expiresAt: Date } {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + this.TOKEN_EXPIRY);

    return { token, expiresAt };
  }

  // Validate reset token expiry
  static isTokenValid(expiresAt: Date): boolean {
    return new Date() < expiresAt;
  }

  // Generate secure temporary password
  static generateTemporaryPassword(): string {
    return PasswordManager.generateSecurePassword(12);
  }
}
