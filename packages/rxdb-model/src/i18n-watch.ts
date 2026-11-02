import type { ModelI18n } from './i18n.js';

/**
 * 订阅翻译运行时的语言 / 目录变化，供控制器在变化后重建已生成的文案。
 * @remarks 运行时的 `changes$` 常是订阅即回放当前值的 `BehaviorSubject`，回放不算变化，只在之后的通知里调用 `listener`。
 * @param i18n - 翻译运行时；缺省或没有 `changes$` 时不订阅。
 * @param listener - 语言或目录变化后的回调。
 * @returns 取消订阅函数；没有订阅时为 `undefined`。
 */
export function onModelI18nChange(i18n: ModelI18n | undefined, listener: () => void): (() => void) | undefined {
  const changes = i18n?.changes$;
  if (!changes) return undefined;
  let replaying = true;
  const subscription = changes.subscribe(() => {
    if (!replaying) listener();
  });
  replaying = false;
  return () => subscription.unsubscribe();
}
