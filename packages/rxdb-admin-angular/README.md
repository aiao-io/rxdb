# @aiao/rxdb-admin-angular

`@aiao/rxdb-admin` 的 Angular 绑定：`rxdb-admin-layout`（侧栏 / 顶栏 / 页签栏 / 内容区 / 页脚）、偏好抽屉、命令面板、锁屏与水印。全部是独立组件，`OnPush` + signals，零 zone 依赖；DOM 结构、类名与 `data-testid` 与 React / Vue 绑定一致。

## 样式

需要应用自己启用 Tailwind 与 daisyUI。在样式入口引入本包的 Tailwind 源注册和外壳样式契约（后者来自核心包）：

```css
@import 'tailwindcss';
@import '@aiao/rxdb-admin-angular/tailwind.css';
@import '@aiao/rxdb-admin/admin.css';

@plugin 'daisyui' {
  themes:
    light --default,
    dark --prefersdark,
    dracula;
}
```

`createAdminShell({ themes })` 里的主题必须与这里启用的 daisyUI 主题一致。

## 接入

创建外壳时图标类型用 `AdminIcon`（`@lucide/angular` 的图标输入），并把 `provideAdminShell(shell)` 放进应用的 providers。它在环境初始化时（早于任何组件渲染）绑定浏览器，主题、布局变量第一帧就位，注入器销毁时解除：

```ts
import { createAdminShell } from '@aiao/rxdb-admin';
import { provideAdminShell, type AdminIcon } from '@aiao/rxdb-admin-angular';

export const shell = createAdminShell<AdminIcon>({
  brand: { title: '工作台' },
  navigate: url => void router.navigateByUrl(url)
});

bootstrapApplication(App, { providers: [provideZonelessChangeDetection(), provideAdminShell(shell)] });
```

```ts
@Component({
  selector: 'app-root',
  imports: [AdminLayoutComponent, AdminPageDirective, LucideDynamicIcon, RouterOutlet],
  template: `
    <rxdb-admin-layout [menu]="menu" [menuExtra]="extra" [navigating]="navigating()" [url]="url()">
      <svg [lucideIcon]="Database" [size]="16" brandIcon></svg>
      <router-outlet *rxdbAdminPage />
    </rxdb-admin-layout>
    <ng-template #extra let-node><span class="badge badge-ghost badge-xs">0</span></ng-template>
  `
})
export class App {
  readonly menu = MENU; // 稳定引用：每次变更检测都新建数组会反复触发外壳更新
  readonly Database = LucideDatabase;
  readonly url = signal('/');
  readonly navigating = signal(false);
}
```

## `rxdb-admin-layout`

| 输入 / 投影                   | 说明                                                      |
| ----------------------------- | --------------------------------------------------------- |
| `menu`                        | `MenuNode<AdminIcon>[]` 导航菜单，须是稳定引用            |
| `url`                         | 当前地址（路径 + 查询串），变化时同步页签 / 标题          |
| `navigating`                  | 导航进行中，驱动顶部进度条与加载遮罩                      |
| `menuExtra`                   | 菜单项右侧附加内容的 `TemplateRef`，`let-node` 是菜单节点 |
| 默认投影                      | 页面内容；见下文「刷新」                                  |
| `[brandIcon]`                 | 没有 Logo 图片时的品牌图标                                |
| `[headerStart]`/`[headerEnd]` | 顶栏部件区之前 / 之后的扩展内容                           |

**刷新 = 重挂载。** 顶栏与页签右键的「刷新」要重新创建页面内容，但 Angular 的 `<ng-content>` 投影内容归父视图所有，布局无法重建它。把页面内容放进 `*rxdbAdminPage`（如上例的 `<router-outlet *rxdbAdminPage />`）后，布局以模板方式实例化它，刷新时旧实例销毁、新实例创建。直接投影内容（不用该指令）时，刷新只重建 `.admin-page` 容器，投影内容本身不会被重建。

「跳到主要内容」链接会聚焦内容区而不是跟随 `href="#layout-content"`：Angular 应用的 `<base href>` 会把纯锚点解析成「根路径 + 锚点」，造成整页跳转。

## 注入函数

须在注入上下文（构造函数或字段初始化器）中调用：

- `injectAdminShell()`：读取最近的外壳，缺少 `provideAdminShell` 时抛错。
- `injectAdminStore(store)`：把外壳暴露的任一可读存储桥接为 `Signal`（`shell.preferences`、`shell.layout`、`shell.tabs`……），随注入上下文销毁而退订。
- `injectAdminText()`：翻译外壳文案的函数；在模板、`computed` 或 `effect` 里调用时建立对文案修订号的 signal 依赖，语言切换后 `OnPush` 组件也会重新渲染。

```ts
readonly prefs = injectAdminStore(shell.preferences);
readonly pageSize = computed(() => this.prefs().extension['searchPageSize'] as number);
```

`shell.attach()` 幂等但不计数：同一个外壳在多个注入器里 `provideAdminShell`，任一注入器销毁都会解除全部绑定。

## 其他导出

`AdminSidebarComponent` / `AdminBrandComponent`、`AdminHeaderComponent` / `AdminHeaderMenuComponent` / `AdminBreadcrumbComponent`、`AdminTabbarComponent`、`AdminHeaderWidgetsComponent`、`AdminPreferencesDrawerComponent`、`AdminCommandPaletteComponent`、`AdminLockScreenComponent`、`AdminWatermarkComponent`、`AdminFooterComponent`、`AdminMenuTreeComponent` 都可单独使用，用来搭建自定义外壳；`AdminLayoutComponent` 是它们的默认组合。命令面板、偏好抽屉与锁屏使用原生 `<dialog>`，焦点陷阱、Esc 与背景惰性由浏览器负责。
