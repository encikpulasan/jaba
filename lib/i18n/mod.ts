// Internationalization Module
// Central exports for all i18n functionality

export {
  formatDate,
  formatNumber,
  getDirection,
  i18n,
  I18nManager,
  isRTL,
  t,
} from "./core.ts";
export { ContentLocalizationManager } from "./content.ts";
export { TranslationWorkflowManager } from "./workflows.ts";
export { TranslationMemoryManager } from "./memory.ts";
export { I18nRouter, LocalizedRoutesMatcher } from "./routing.ts";
