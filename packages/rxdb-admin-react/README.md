# @aiao/rxdb-admin-react

`@aiao/rxdb-admin` 的 React 绑定：`AdminLayout`（侧栏 / 顶栏 / 页签栏 / 内容区 / 页脚）、偏好抽屉、命令面板、锁屏与水印。外壳由应用用 `createAdminShell` 创建，组件只负责渲染。

## 样式

需要应用自己启用 Tailwind 与 daisyUI。在样式入口引入本包的 Tailwind 源注册和外壳样式契约（后者来自核心包）：

```css
@import 'tailwindcss';
@import '@aiao/rxdb-admin-react/tailwind.css';
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

```tsx
import { createAdminShell } from '@aiao/rxdb-admin';
import { AdminLayout, AdminShellProvider } from '@aiao/rxdb-admin-react';
import { Database } from 'lucide-react';
import type { ReactNode } from 'react';
import { Outlet, useLocation, useNavigation } from 'react-router-dom';

const shell = createAdminShell<ReactNode>({
  brand: { title: '工作台' },
  navigate: url => void router.navigate(url)
});
shell.attach(); // 首次渲染之前绑定浏览器：主题、布局变量第一帧就位

function Layout() {
  const location = useLocation();
  const navigation = useNavigation();
  return (
    <AdminLayout
      menu={menu}
      url={`${location.pathname}${location.search}`}
      navigating={navigation.state !== 'idle'}
      brandIcon={<Database size={16} />}
    >
      <Outlet />
    </AdminLayout>
  );
}

export const App = () => (
  <AdminShellProvider shell={shell}>
    <Layout />
  </AdminShellProvider>
);
```

`AdminShellProvider` 在挂载期间绑定浏览器（快捷键、主题、布局变量、标题），`attach` 幂等。`AdminLayout` 的属性：

| 属性              | 说明                                             |
| ----------------- | ------------------------------------------------ |
| `menu`            | `MenuNode<ReactNode>[]` 导航菜单                 |
| `url`             | 当前地址（路径 + 查询串），变化时同步页签 / 标题 |
| `children`        | 路由出口；顶栏与页签右键的「刷新」会重新挂载它   |
| `navigating`      | 导航进行中，驱动顶部进度条与加载遮罩             |
| `brandIcon`       | 没有 Logo 图片时的品牌图标                       |
| `renderMenuExtra` | 菜单项右侧附加内容（徽标、计数）                 |
| `headerStart/End` | 顶栏部件区之前 / 之后的扩展内容                  |

## Hooks

- `useAdminShell()`：读取最近的外壳，缺少 Provider 时抛错。
- `useAdminStore(store)`：订阅外壳暴露的任一可读存储（`shell.preferences`、`shell.layout`、`shell.tabs`……），值变化时重新渲染。
- `useAdminText()`：翻译外壳文案的函数，语言或目录变化时重新渲染。

```tsx
const { extension } = useAdminStore(shell.preferences);
const pageSize = extension['searchPageSize'] as number;
```

## 其他导出

`Sidebar` / `Brand`、`Header` / `HeaderMenu` / `Breadcrumb`、`Tabbar`、`HeaderWidgets`、`PreferencesDrawer`、`CommandPalette`、`LockScreen`、`Watermark`、`Footer`、`MenuTree` 都可单独使用，用来搭建自定义外壳；`AdminLayout` 是它们的默认组合。命令面板、偏好抽屉与锁屏使用原生 `<dialog>`，焦点陷阱、Esc 与背景惰性由浏览器负责。
