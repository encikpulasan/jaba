// Internationalization Routing System
// Handles locale detection, URL routing, and language-specific paths

import type { Locale, LocaleConfig } from "@/types";
import { i18n } from "./core.ts";

export class I18nRouter {
  private static localePatterns = new Map<Locale, RegExp>();

  // Initialize router with available locales
  static initialize(locales: LocaleConfig[]): void {
    for (const config of locales) {
      if (config.enabled) {
        const pattern = new RegExp(`^/${config.code}(/.*)?$`, "i");
        this.localePatterns.set(config.code as Locale, pattern);
      }
    }
  }

  // Extract locale from URL path
  static extractLocaleFromPath(pathname: string): {
    locale: Locale | null;
    pathWithoutLocale: string;
  } {
    // Handle root path
    if (pathname === "/" || pathname === "") {
      return {
        locale: null,
        pathWithoutLocale: "/",
      };
    }

    // Check each locale pattern
    for (const [locale, pattern] of this.localePatterns.entries()) {
      const match = pathname.match(pattern);
      if (match) {
        return {
          locale,
          pathWithoutLocale: match[1] || "/",
        };
      }
    }

    return {
      locale: null,
      pathWithoutLocale: pathname,
    };
  }

  // Detect locale from various sources
  static detectLocale(request: Request): {
    detected: Locale;
    source: "url" | "cookie" | "header" | "default";
    confidence: number;
  } {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. Check URL path first (highest priority)
    const { locale: urlLocale } = this.extractLocaleFromPath(pathname);
    if (urlLocale && this.isLocaleSupported(urlLocale)) {
      return {
        detected: urlLocale,
        source: "url",
        confidence: 1.0,
      };
    }

    // 2. Check locale cookie
    const cookies = request.headers.get("cookie");
    if (cookies) {
      const cookieLocale = this.extractLocaleFromCookie(cookies);
      if (cookieLocale && this.isLocaleSupported(cookieLocale)) {
        return {
          detected: cookieLocale,
          source: "cookie",
          confidence: 0.8,
        };
      }
    }

    // 3. Check Accept-Language header
    const acceptLanguage = request.headers.get("accept-language");
    if (acceptLanguage) {
      const headerLocale = this.negotiateLocaleFromHeader(acceptLanguage);
      if (headerLocale) {
        return {
          detected: headerLocale.locale,
          source: "header",
          confidence: headerLocale.quality,
        };
      }
    }

    // 4. Use default locale
    return {
      detected: i18n.getCurrentLocale(),
      source: "default",
      confidence: 0.1,
    };
  }

  // Extract locale from cookie string
  private static extractLocaleFromCookie(cookieString: string): Locale | null {
    const match = cookieString.match(/locale=([a-z]{2}(-[A-Z]{2})?)/);
    return match ? match[1] as Locale : null;
  }

  // Negotiate locale from Accept-Language header
  private static negotiateLocaleFromHeader(acceptLanguage: string): {
    locale: Locale;
    quality: number;
  } | null {
    const locales = acceptLanguage
      .split(",")
      .map((lang) => {
        const [locale, q = "1"] = lang.trim().split(";q=");
        const quality = parseFloat(q) || 1;
        const normalizedLocale = locale.toLowerCase().substring(0, 2) as Locale;

        return { locale: normalizedLocale, quality };
      })
      .filter(({ locale }) => this.isLocaleSupported(locale))
      .sort((a, b) => b.quality - a.quality);

    return locales.length > 0 ? locales[0] : null;
  }

  // Check if locale is supported
  static isLocaleSupported(locale: Locale): boolean {
    const availableLocales = i18n.getAvailableLocales();
    return availableLocales.some((config) => config.code === locale);
  }

  // Generate localized URL
  static localizeUrl(
    path: string,
    locale: Locale,
    options?: {
      includeDefaultLocale?: boolean;
      baseUrl?: string;
    },
  ): string {
    const defaultLocale = i18n.getCurrentLocale();
    const includeDefault = options?.includeDefaultLocale || false;
    const baseUrl = options?.baseUrl || "";

    // Don't include locale prefix for default locale unless explicitly requested
    if (locale === defaultLocale && !includeDefault) {
      return `${baseUrl}${path}`;
    }

    // Ensure path starts with /
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    return `${baseUrl}/${locale}${normalizedPath}`;
  }

  // Generate alternate language links for SEO
  static generateAlternateLinks(
    path: string,
    currentLocale: Locale,
    baseUrl: string,
  ): Array<{ locale: Locale; url: string; hreflang: string }> {
    const availableLocales = i18n.getAvailableLocales();
    const links: Array<{ locale: Locale; url: string; hreflang: string }> = [];

    for (const localeConfig of availableLocales) {
      const locale = localeConfig.code as Locale;

      if (locale !== currentLocale) {
        const url = this.localizeUrl(path, locale, { baseUrl });
        const hreflang = localeConfig.hreflang || locale;

        links.push({ locale, url, hreflang });
      }
    }

    return links;
  }

  // Create response with locale cookie
  static createResponseWithLocaleCookie(
    response: Response,
    locale: Locale,
    options?: {
      maxAge?: number;
      domain?: string;
      secure?: boolean;
      sameSite?: "strict" | "lax" | "none";
    },
  ): Response {
    const maxAge = options?.maxAge || (365 * 24 * 60 * 60); // 1 year
    const domain = options?.domain ? `; Domain=${options.domain}` : "";
    const secure = options?.secure !== false ? "; Secure" : "";
    const sameSite = options?.sameSite || "lax";

    const cookieValue =
      `locale=${locale}; Max-Age=${maxAge}; Path=/${domain}${secure}; SameSite=${sameSite}`;

    response.headers.set("Set-Cookie", cookieValue);
    return response;
  }

  // Redirect to localized URL
  static redirectToLocalizedUrl(
    path: string,
    targetLocale: Locale,
    options?: {
      status?: number;
      baseUrl?: string;
    },
  ): Response {
    const status = options?.status || 302;
    const localizedUrl = this.localizeUrl(path, targetLocale, {
      baseUrl: options?.baseUrl,
    });

    return new Response(null, {
      status,
      headers: {
        Location: localizedUrl,
      },
    });
  }

  // Get supported locales info
  static getSupportedLocales(): Array<{
    code: Locale;
    name: string;
    nativeName: string;
    rtl: boolean;
    enabled: boolean;
  }> {
    return i18n.getAvailableLocales().map((config: LocaleConfig) => ({
      code: config.code as Locale,
      name: config.name,
      nativeName: config.nativeName,
      rtl: config.rtl || false,
      enabled: config.enabled,
    }));
  }

  // Validate and normalize locale
  static normalizeLocale(locale: string): Locale | null {
    const normalized = locale.toLowerCase().substring(0, 2) as Locale;
    return this.isLocaleSupported(normalized) ? normalized : null;
  }
}

// Route matching utilities
export class LocalizedRoutesMatcher {
  private routes = new Map<string, Map<Locale, string>>();

  // Add localized route pattern
  addRoute(key: string, routes: Record<Locale, string>): void {
    const routeMap = new Map<Locale, string>();

    for (const [locale, pattern] of Object.entries(routes)) {
      routeMap.set(locale as Locale, pattern);
    }

    this.routes.set(key, routeMap);
  }

  // Match path against localized routes
  matchRoute(path: string, locale: Locale): {
    key: string;
    params: Record<string, string>;
  } | null {
    for (const [key, localeRoutes] of this.routes) {
      const pattern = localeRoutes.get(locale);
      if (!pattern) continue;

      const match = this.matchPattern(path, pattern);
      if (match) {
        return {
          key,
          params: match,
        };
      }
    }

    return null;
  }

  // Simple pattern matching (supports :param syntax)
  private matchPattern(
    path: string,
    pattern: string,
  ): Record<string, string> | null {
    const patternParts = pattern.split("/");
    const pathParts = path.split("/");

    if (patternParts.length !== pathParts.length) {
      return null;
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];

      if (patternPart.startsWith(":")) {
        // Parameter
        const paramName = patternPart.slice(1);
        params[paramName] = decodeURIComponent(pathPart);
      } else if (patternPart !== pathPart) {
        // Literal mismatch
        return null;
      }
    }

    return params;
  }

  // Generate URL for route key and locale
  generateUrl(
    key: string,
    locale: Locale,
    params: Record<string, string> = {},
  ): string | null {
    const localeRoutes = this.routes.get(key);
    if (!localeRoutes) return null;

    const pattern = localeRoutes.get(locale);
    if (!pattern) return null;

    let url = pattern;
    for (const [param, value] of Object.entries(params)) {
      url = url.replace(`:${param}`, encodeURIComponent(value));
    }

    return url;
  }
}

export default I18nRouter;
