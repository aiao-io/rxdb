import type { MenuNode } from '@aiao/rxdb-admin';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, type TemplateRef } from '@angular/core';
import { LucideDynamicIcon, LucideMenu } from '@lucide/angular';
import { injectAdminShell, injectAdminStore, injectAdminText, type AdminIcon } from '../context';
import { AdminHeaderWidgetsComponent } from '../widgets/header-widgets.component';
import { AdminBrandComponent } from './brand.component';
import { AdminBreadcrumbComponent } from './breadcrumb.component';
import { AdminHeaderMenuComponent } from './header-menu.component';

/**
 * 顶栏：菜单开关、品牌（顶栏布局时）、水平菜单、面包屑与部件。内容最大化时不渲染。
 */
@Component({
  selector: 'rxdb-admin-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AdminBrandComponent,
    AdminBreadcrumbComponent,
    AdminHeaderMenuComponent,
    AdminHeaderWidgetsComponent,
    LucideDynamicIcon,
    NgTemplateOutlet
  ],
  host: { style: 'display: contents' },
  templateUrl: './header.component.html'
})
export class AdminHeaderComponent {
  protected readonly shell = injectAdminShell();
  protected readonly t = injectAdminText();
  protected readonly layout = injectAdminStore(this.shell.layout);
  protected readonly ui = injectAdminStore(this.shell.ui);
  protected readonly prefs = injectAdminStore(this.shell.preferences);
  protected readonly isDark = injectAdminStore(this.shell.theme.isDark);
  protected readonly mobile = injectAdminStore(this.shell.isMobile);
  protected readonly semiDark = computed(() =>
    this.layout().semiDarkHeader && !this.isDark() ? this.shell.theme.darkName : undefined
  );
  protected readonly expanded = computed(() =>
    this.mobile() ? this.ui().drawerOpen : !this.layout().sidebarCollapsed
  );
  protected readonly Menu = LucideMenu;

  /** 菜单树（顶部导航模式渲染为水平菜单）。 */
  readonly menu = input.required<readonly MenuNode<AdminIcon>[]>();

  /** 品牌图标模板。 */
  readonly brandIcon = input<TemplateRef<unknown>>();

  /** 顶栏部件区之前的扩展内容模板。 */
  readonly start = input<TemplateRef<unknown>>();

  /** 顶栏部件区之后的扩展内容模板。 */
  readonly end = input<TemplateRef<unknown>>();
}
