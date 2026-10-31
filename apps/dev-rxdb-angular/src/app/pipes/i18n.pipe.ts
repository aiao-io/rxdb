import { useI18nOptional } from '@aiao/rxdb-i18n-angular';
import { Pipe, type PipeTransform } from '@angular/core';
import { appMessages } from '../rxdb/i18n';

const fallbackMessages = appMessages[0]?.messages ?? {};

/** 在 Angular 模板中读取响应式国际化文案。 */
@Pipe({
  name: 'i18n',
  standalone: true,
  pure: false
})
export class I18nPipe implements PipeTransform {
  readonly #i18n = useI18nOptional();

  transform(key: string, params?: Record<string, unknown>, namespace = 'app'): string {
    if (!this.#i18n) return this.#fallback(key, params);
    this.#i18n.locale();
    return this.#i18n.t(key, params, namespace);
  }

  #fallback(key: string, params?: Record<string, unknown>): string {
    const message = fallbackMessages[key] ?? key;
    return Object.entries(params ?? {}).reduce(
      (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
      message
    );
  }
}
