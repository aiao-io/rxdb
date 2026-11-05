import { Subscription, type Unsubscribable } from 'rxjs';
import type { ModelI18n } from './i18n.js';

/** 目标被回收时退订；持有的只有订阅本身，不引用目标。 */
const abandoned = new FinalizationRegistry<Unsubscribable>(subscription => subscription.unsubscribe());

/**
 * 订阅翻译运行时的语言 / 目录变化，供控制器在变化后重建已生成的文案。
 * @remarks 运行时的 `changes$` 与应用同寿命，订阅若强引用控制器，就会让从不 `dispose()` 的宿主
 * （如 React 绑定：卸载后随组件回收）永远回收不了它。所以这里只弱引用 `owner`，`refresh` 不得捕获 `owner`
 * 而只用参数；`owner` 被回收后在下一次通知时自行退订，登记表也会在回收时退订。
 * @param i18n - 翻译运行时；缺省或没有 `changes$` 时不订阅。
 * @param owner - 持有订阅的控制器。
 * @param refresh - 语言或目录变化后的回调，参数是仍存活的 `owner`。
 * @returns 取消订阅句柄；没有订阅时是空订阅。
 */
export function onModelI18nChange<T extends object>(
  i18n: ModelI18n | undefined,
  owner: T,
  refresh: (owner: T) => void
): Unsubscribable {
  const changes = i18n?.changes$;
  if (!changes) return Subscription.EMPTY;
  const ref = new WeakRef(owner);
  // 先建容器再 add：BehaviorSubject 订阅即回放，回调可能在订阅返回前就运行
  const subscription = new Subscription();
  subscription.add(
    changes.subscribe(() => {
      const alive = ref.deref();
      if (alive) refresh(alive);
      else subscription.unsubscribe();
    })
  );
  abandoned.register(owner, subscription);
  return subscription;
}
