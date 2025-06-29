// Migration: I18n Setup
// Initialize internationalization system with default locales

import type { Migration } from "@/types";
import { db } from "@/lib/db/mod.ts";
import { KeyPatterns } from "@/lib/db/patterns.ts";
import type { LocaleConfig } from "@/types";

const migration: Migration = {
  version: 4,
  name: "I18n Setup",
  description: "Initialize internationalization system with default locales",

  async up() {
    console.log("🌍 Setting up internationalization system...");

    const connection = db.getConnection();
    const atomic = (connection.kv as Deno.Kv).atomic();

    // Default locales configuration
    const defaultLocales: LocaleConfig[] = [
      {
        code: "en",
        name: "English",
        nativeName: "English",
        enabled: true,
        rtl: false,
        hreflang: "en",
        pluralRule: "simple",
      },
      {
        code: "es",
        name: "Spanish",
        nativeName: "Español",
        enabled: true,
        rtl: false,
        hreflang: "es",
        pluralRule: "simple",
      },
      {
        code: "fr",
        name: "French",
        nativeName: "Français",
        enabled: false,
        rtl: false,
        hreflang: "fr",
        pluralRule: "simple",
      },
      {
        code: "de",
        name: "German",
        nativeName: "Deutsch",
        enabled: false,
        rtl: false,
        hreflang: "de",
        pluralRule: "simple",
      },
      {
        code: "ar",
        name: "Arabic",
        nativeName: "العربية",
        enabled: false,
        rtl: true,
        hreflang: "ar",
        pluralRule: "complex",
      },
    ];

    // Store locale configurations
    for (const locale of defaultLocales) {
      atomic.set(KeyPatterns.translations.locales(locale.code), locale);
    }

    // Store default translation keys for common namespace
    const commonTranslations = {
      en: {
        "app.name": "masmaCMS",
        "app.tagline": "Enterprise Headless CMS",
        "ui.save": "Save",
        "ui.cancel": "Cancel",
        "ui.delete": "Delete",
        "ui.edit": "Edit",
        "ui.create": "Create",
        "ui.update": "Update",
        "ui.loading": "Loading...",
        "ui.error": "Error",
        "ui.success": "Success",
        "auth.login": "Login",
        "auth.logout": "Logout",
        "auth.register": "Register",
        "content.title": "Title",
        "content.content": "Content",
        "content.published": "Published",
        "content.draft": "Draft",
      },
      es: {
        "app.name": "masmaCMS",
        "app.tagline": "CMS Sin Cabeza Empresarial",
        "ui.save": "Guardar",
        "ui.cancel": "Cancelar",
        "ui.delete": "Eliminar",
        "ui.edit": "Editar",
        "ui.create": "Crear",
        "ui.update": "Actualizar",
        "ui.loading": "Cargando...",
        "ui.error": "Error",
        "ui.success": "Éxito",
        "auth.login": "Iniciar Sesión",
        "auth.logout": "Cerrar Sesión",
        "auth.register": "Registrarse",
        "content.title": "Título",
        "content.content": "Contenido",
        "content.published": "Publicado",
        "content.draft": "Borrador",
      },
    };

    // Store translation data
    for (const [locale, translations] of Object.entries(commonTranslations)) {
      atomic.set(
        KeyPatterns.translations.byNamespace("common", locale),
        translations,
      );
    }

    // Store i18n system settings
    const i18nSettings = {
      defaultLocale: "en",
      fallbackLocale: "en",
      enabledLocales: ["en", "es"],
      autoDetectLocale: true,
      showLanguageSwitcher: true,
      urlStrategy: "prefix", // "prefix" | "domain" | "subdomain"
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    atomic.set(KeyPatterns.settings.i18n(), i18nSettings);

    await atomic.commit();

    console.log("✅ I18n system setup completed");
    console.log(`📍 Configured ${defaultLocales.length} locales`);
    console.log(
      `🔤 Added translations for ${
        Object.keys(commonTranslations).length
      } languages`,
    );
  },

  async down() {
    console.log("🔄 Rolling back i18n setup...");

    const connection = db.getConnection();
    const atomic = (connection.kv as Deno.Kv).atomic();

    // Remove locale configurations
    const localeIterator = (connection.kv as Deno.Kv).list({
      prefix: KeyPatterns.translations.locales(""),
    });

    for await (const { key } of localeIterator) {
      atomic.delete(key);
    }

    // Remove translation data
    const translationIterator = (connection.kv as Deno.Kv).list({
      prefix: KeyPatterns.translations.all(),
    });

    for await (const { key } of translationIterator) {
      atomic.delete(key);
    }

    // Remove i18n settings
    atomic.delete(KeyPatterns.settings.i18n());

    await atomic.commit();
    console.log("✅ I18n setup rollback completed");
  },
};

export default migration;
