import { Directive, inject, TemplateRef } from '@angular/core';

/**
 * 标记 `AdminLayoutComponent` 的页面内容，让「刷新」能重新创建它。
 *
 * @remarks
 * React 用 `key={refreshKey}` 重建内容区；Angular 的 `<ng-content>` 投影内容归父视图所有，布局无法重建。
 * 把页面内容放进 `*rxdbAdminPage` 后，布局以模板的方式实例化它：`shell.ui.refresh()` 递增刷新计数时，
 * 旧实例销毁、新实例创建，页面内的组件随之重新创建。
 *
 * 不使用该指令、直接投影内容时，刷新只重建 `.admin-page` 容器，**投影进来的内容不会被重建**。
 *
 * @example
 * ```html
 * <rxdb-admin-layout [menu]="menu" [url]="url()">
 *   <router-outlet *rxdbAdminPage />
 * </rxdb-admin-layout>
 * ```
 */
@Directive({ selector: 'ng-template[rxdbAdminPage]' })
export class AdminPageDirective {
  /** 页面内容的模板。 */
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}
