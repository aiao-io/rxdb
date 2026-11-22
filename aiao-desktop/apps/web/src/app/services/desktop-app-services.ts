import { DestroyRef, DestroyableInjector, Injector, Service, Type, inject } from '@angular/core';

/** 由首次使用功能的窗口提供服务类型，同一桌面的窗口共用实例和销毁时机。 */
@Service({ autoProvided: false })
export class DesktopAppServices {
  private readonly parent = inject(Injector);
  private readonly owner = inject(DestroyRef);
  private readonly scopes = new Map<Type<unknown>, DestroyableInjector>();

  get<T>(type: Type<T>): T {
    const existing = this.scopes.get(type);
    if (existing) return existing.get(type);
    const scope = Injector.create({ providers: [type], parent: this.parent });
    this.owner.onDestroy(() => scope.destroy());
    this.scopes.set(type, scope);
    return scope.get(type);
  }
}
