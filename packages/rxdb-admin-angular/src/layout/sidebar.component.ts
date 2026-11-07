import type { MenuNode } from '@aiao/rxdb-admin';
import { ChangeDetectionStrategy, Component, computed, input, type TemplateRef } from '@angular/core';
import { LucideDynamicIcon, LucidePanelLeftClose, LucidePanelLeftOpen } from '@lucide/angular';
import { injectAdminShell, injectAdminStore, injectAdminText, type AdminIcon } from '../context';
import { AdminBrandComponent } from './brand.component';
import { AdminMenuTreeComponent, type MenuExtraTemplate } from './menu-tree.component';
import { AdminSidebarResizerComponent } from './sidebar-resizer.component';

/**
 * 侧栏：品牌、菜单树、折叠按钮、宽度拖拽；折叠时可悬停展开，移动端是抽屉。布局不需要侧栏时不渲染。
 */
@Component({
  selector: 'rxdb-admin-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminBrandComponent, AdminMenuTreeComponent, AdminSidebarResizerComponent, LucideDynamicIcon],
  host: { style: 'display: contents' },
  templateUrl: './sidebar.component.html'
})
export class AdminSidebarComponent {
  protected readonly shell = injectAdminShell();
  protected readonly t = injectAdminText();
  protected readonly layout = injectAdminStore(this.shell.layout);
  protected readonly ui = injectAdminStore(this.shell.ui);
  protected readonly prefs = injectAdminStore(this.shell.preferences);
  protected readonly isDark = injectAdminStore(this.shell.theme.isDark);
  protected readonly mobile = injectAdminStore(this.shell.isMobile);
  protected readonly collapsed = computed(() => this.layout().sidebarCollapsed);
  protected readonly hoverExpanded = computed(() => this.collapsed() && this.ui().hoverExpanded);
  protected readonly rail = computed(() => this.collapsed() && !this.hoverExpanded());
  protected readonly semiDark = computed(() =>
    this.layout().semiDarkSidebar && !this.isDark() ? this.shell.theme.darkName : undefined
  );
  protected readonly PanelLeftClose = LucidePanelLeftClose;
  protected readonly PanelLeftOpen = LucidePanelLeftOpen;

  /** 菜单树。 */
  readonly menu = input.required<readonly MenuNode<AdminIcon>[]>();

  /** 品牌图标模板（没有 Logo 图片时显示）。 */
  readonly brandIcon = input<TemplateRef<unknown>>();

  /** 菜单项右侧附加内容的模板。 */
  readonly menuExtra = input<MenuExtraTemplate>();

  protected hoverIn(): void {
    if (this.collapsed() && this.prefs().sidebar.expandOnHover) this.shell.ui.setHoverExpanded(true);
  }

  protected hoverOut(): void {
    this.shell.ui.setHoverExpanded(false);
  }
}
