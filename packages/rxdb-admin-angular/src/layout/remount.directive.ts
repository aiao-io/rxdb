import { Directive, effect, inject, input, TemplateRef, untracked, ViewContainerRef } from '@angular/core';

/**
 * 结构型指令：`key` 每次变化都销毁并重新创建它所在的模板实例（相当于 React 的 `key`）。
 * 用 `ViewContainerRef` 手动重建，而不是 `@for (… track key)`：后者在整表重建时会在开发模式下打印 NG0956 警告。
 *
 * @example
 * ```html
 * <div *rxdbAdminRemount="refreshKey()">…</div>
 * ```
 */
@Directive({ selector: '[rxdbAdminRemount]' })
export class AdminRemountDirective {
  readonly #container = inject(ViewContainerRef);
  readonly #template = inject<TemplateRef<unknown>>(TemplateRef);

  /** 变化即重建的键。 */
  readonly key = input.required<unknown>({ alias: 'rxdbAdminRemount' });

  constructor() {
    effect(() => {
      this.key();
      untracked(() => {
        this.#container.clear();
        this.#container.createEmbeddedView(this.#template);
      });
    });
  }
}
