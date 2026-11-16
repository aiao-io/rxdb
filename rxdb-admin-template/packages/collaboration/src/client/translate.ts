import { collaborationEnglish } from '../messages.js';
export type Translate = (key: string, values: Record<string, string>) => string;
let translate: Translate | undefined;
export function useTranslation(value: Translate | undefined): void {
  translate = value;
}
/** 固定产品文案交给应用翻译运行时；用户记录值不作为词条查找。 */
export function tx(text: string, values: Record<string, unknown> = {}): string {
  const args = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)]));
  if (translate && Object.hasOwn(collaborationEnglish, text)) return translate(`collaboration.${text}`, args);
  return text.replace(/\{(v\d+)\}/g, (_match, key: string) => args[key] ?? `{${key}}`);
}
