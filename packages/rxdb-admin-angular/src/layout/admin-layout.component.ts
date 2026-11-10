import { menuTitleOf, type MenuNode } from '@aiao/rxdb-admin';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  effect,
  ElementRef,
  input,
  viewChild
} from '@angular/core';
import { injectAdminShell, injectAdminStore, injectAdminText, type AdminIcon } from '../context';
import { AdminLockScreenComponent } from '../lock/lock-screen.component';
import { AdminCommandPaletteComponent } from '../palette/command-palette.component';
import { AdminPreferencesDrawerComponent } from '../preferences/preferences-drawer.component';
import { AdminTabbarComponent } from '../tabbar/tabbar.component';
import { AdminWatermarkComponent } from '../watermark.component';
import { AdminPageDirective } from './admin-page.directive';
import { AdminFooterComponent } from './footer.component';
import { AdminHeaderComponent } from './header.component';
import { type MenuExtraTemplate } from './menu-tree.component';
import { AdminRemountDirective } from './remount.directive';
import { AdminSidebarComponent } from './sidebar.component';

const pathOf = (url: string): string => url.split(/[?#]/, 1)[0];

function restartEnterAnimation(element: HTMLElement): void {
  element.removeAttribute('data-entering');
  void element.offsetWidth;
  element.setAttribute('data-entering', 'true');
}

/**
 * 后台外壳布局：侧栏 / 顶栏 / 页签栏 / 内容区 / 页脚，外加偏好抽屉、命令面板、锁屏与水印。
 * 布局模式、尺寸、显隐全部由外壳偏好驱动；路由库无关，应用只需传入当前地址并在 `navigate` 回调里跳转。
 *
 * @remarks
 * 内容投影：默认 `<ng-content>` 是页面内容（路由出口）；具名插槽 `[brandIcon]`（没有 Logo 图片时的品牌图标）、
 * `[headerStart]` / `[headerEnd]`（顶栏部件区前 / 后的扩展内容）。菜单项右侧附加内容用 `menuExtra` 模板输入，
 * 模板上下文是菜单节点（`let-node`）。
 *
 * **刷新 = 重挂载**：React 以 `key={refreshKey}` 重建内容区；Angular 无法重建 `<ng-content>` 投影的内容，
 * 所以把页面内容放进 `*rxdbAdminPage`（{@link AdminPageDirective}）后，`shell.ui.refresh()` 会销毁并重建该模板实例。
 * 直接投影内容（不用该指令）时，刷新只重建 `.admin-page` 容器，**投影内容本身不会被重建**。
 *
 * @example
 * ```html
 * <rxdb-admin-layout [menu]="menu" [url]="url()" [navigating]="navigating()">
 *   <svg brandIcon [lucideIcon]="Database"></svg>
 *   <router-outlet *rxdbAdminPage />
 * </rxdb-admin-layout>
 * ```
 */
@Component({
  selector: 'rxdb-admin-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AdminCommandPaletteComponent,
    AdminFooterComponent,
    AdminHeaderComponent,
    AdminLockScreenComponent,
    AdminPreferencesDrawerComponent,
    AdminRemountDirective,
    AdminSidebarComponent,
    AdminTabbarComponent,
    AdminWatermarkComponent,
    NgTemplateOutlet
  ],
  host: { style: 'display: contents' },
  templateUrl: './admin-layout.component.html'
})
export class AdminLayoutComponent {
  readonly #shell = injectAdminShell();
  #lastPath: string | undefined;

  private readonly page = viewChild<ElementRef<HTMLElement>>('page');
  private readonly content = viewChild<ElementRef<HTMLElement>>('content');

  protected readonly t = injectAdminText();
  protected readonly layout = injectAdminStore(this.#shell.layout);
  protected readonly ui = injectAdminStore(this.#shell.ui);
  protected readonly prefs = injectAdminStore(this.#shell.preferences);
  protected readonly mobile = injectAdminStore(this.#shell.isMobile);
  protected readonly textRevision = injectAdminStore(this.#shell.text);
  /** 品牌名可能按宿主目录翻译（`brand.titleKey`），读文案修订号使语言切换后重新计算。 */
  protected readonly pageTitle = computed(() => {
    this.textRevision();
    return menuTitleOf(this.menu(), this.url()) ?? this.#shell.brandTitle;
  });
  /** 刷新计数：变化时重建页面容器与 `*rxdbAdminPage` 模板实例。 */
  protected readonly refreshKey = computed(() => this.ui().refreshKey);
  protected readonly pageTemplate = contentChild(AdminPageDirective);

  /** 导航菜单。须是稳定引用（`computed` / 字段），每次变更检测都新建数组会反复触发外壳更新。 */
  readonly menu = input.required<readonly MenuNode<AdminIcon>[]>();

  /** 当前路由地址（路径 + 查询串），路由变化时外壳据此同步页签、标题与面包屑。 */
  readonly url = input.required<string>();

  /** 导航进行中（懒加载路由、loader），驱动顶部进度条与加载遮罩。 */
  readonly navigating = input(false);

  /** 菜单项右侧附加内容的模板，上下文是菜单节点。 */
  readonly menuExtra = input<MenuExtraTemplate>();

  constructor() {
    effect(() => this.#shell.setMenu(this.menu()));
    effect(() => this.#shell.syncRoute(this.url()));
    effect(() => this.#shell.ui.setNavigating(this.navigating()));
    effect(() => {
      const path = pathOf(this.url());
      const page = this.page()?.nativeElement;
      const changed = this.#lastPath !== undefined && path !== this.#lastPath;
      this.#lastPath = path;
      if (changed && page) restartEnterAnimation(page);
    });
  }

  /**
   * 跳到主要内容：聚焦内容区而不是跟随 `href="#layout-content"` 导航——
   * Angular 应用的 `<base href>` 会把纯锚点链接解析成「根路径 + 锚点」，造成整页跳转。
   * @param event - 点击事件。
   */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.content()?.nativeElement.focus();
  }
}
