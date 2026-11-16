import { collaborationEnglish } from '../messages.js';
/** 应用提供的翻译函数：入参是 `collaboration.<中文原文>` 形式的消息键与占位符取值（`v0`、`v1`…），返回译文。 */
export type Translate = (key: string, values: Record<string, string>) => string;
let translate: Translate | undefined;
/** 安装当前使用的翻译函数；传入 undefined 则直接显示中文原文。`mountCollaboration` 在挂载时调用。 */
export function useTranslation(value: Translate | undefined): void {
  translate = value;
}
/** 固定产品文案交给应用翻译运行时；用户记录值不作为词条查找。 */
export function tx(text: string, values: Record<string, unknown> = {}): string {
  const args = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)]));
  if (translate && Object.hasOwn(collaborationEnglish, text)) return translate(`collaboration.${text}`, args);
  return text.replace(/\{(v\d+)\}/g, (_match, key: string) => args[key] ?? `{${key}}`);
}
