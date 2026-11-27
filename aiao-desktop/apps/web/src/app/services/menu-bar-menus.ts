import { Service, Signal, computed, signal } from '@angular/core';

import { MenuEntry, MenuSection } from './menu';

/**
 * 菜单栏此刻展示的全部菜单（Apple 菜单 + 前台应用菜单）的登记处。
 *
 * 快捷键分发只认「用户能在菜单栏里看到的命令」：应用菜单和 Apple 菜单是菜单栏组件临时合成的，
 * 不在窗口注册的菜单里（`DesktopWindow.menus()`），所以由菜单栏在这里登记一份，桌面页据此匹配。
 * 菜单栏是常驻组件，登记的是响应式信号；前台应用或菜单状态变化时自动跟着更新。
 */
@Service({ autoProvided: false })
export class MenuBarMenus {
  private readonly sourceState = signal<Signal<readonly MenuSection[]> | null>(null);
  private readonly sectionsState = computed<readonly MenuSection[]>(() => this.sourceState()?.() ?? []);

  /** 当前展示的菜单；还没登记时为空。 */
  readonly sections = this.sectionsState;

  /** 所有菜单项（含分隔线、标题与搜索框，调用方按需过滤）。 */
  readonly entries = computed<readonly MenuEntry[]>(() => this.sectionsState().flatMap(section => section.items));

  /** 由菜单栏在创建时登记它展示的菜单。 */
  set(source: Signal<readonly MenuSection[]>): void {
    this.sourceState.set(source);
  }
}
