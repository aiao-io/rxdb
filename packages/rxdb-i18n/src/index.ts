/**
 * @packageDocumentation
 * Reactive client internationalization runtime for Aiao RxDB.
 */
export {
  catalogMessages,
  messageId,
  resolveMessage,
  type CatalogMessage,
  type MessageCatalog,
  type MessageSource,
  type ResolvedMessage
} from './catalog.js';
export { I18nSettings, MessageEntry, MissingMessageEntry, RemoteMessageEntry, i18nEntities } from './entities.js';
export { I18n, I18n as I18nRuntime, type I18nOptions } from './i18n.js';
export type { I18nInspectedMessage, I18nInspectedMissingMessage, I18nInspection } from './inspection.js';
export { buildLocaleChain, canonicalizeLocale, resolveUiLocale, type LocalePreferences, type UiLocale } from './locale.js';
