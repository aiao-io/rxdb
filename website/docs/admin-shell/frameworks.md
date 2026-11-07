# 三端用法

三个绑定包只做渲染：外壳由应用用 `@aiao/rxdb-admin` 的 `createAdminShell` 创建，三端的 DOM 结构、CSS 类名、`aria-*` 与 `data-testid` 一致，样式共用同一份 `admin.css`，所以同一套端到端用例可以对三端复用。差异只在框架惯用法上。

## 样式接入

外壳样式由应用的 Tailwind + daisyUI 管线生成，包不发布编译样式。在样式入口引入绑定包的 `tailwind.css`（让 Tailwind 扫描组件里用到的类）和核心包的 `admin.css`：

```css
@import 'tailwindcss';
@import '@aiao/rxdb-admin-react/tailwind.css'; /* 或 -vue / -angular */
@import '@aiao/rxdb-admin/admin.css';

@plugin 'daisyui' {
  themes:
    light --default,
    dark --prefersdark,
    dracula;
}
```

`createAdminShell({ themes })` 里的主题必须与这里启用的 daisyUI 主题一致。

## React

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
      renderMenuExtra={node => <span className="badge badge-ghost badge-xs">{counts[node.id]}</span>}
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

菜单是 `MenuNode<ReactNode>[]`，图标由应用决定尺寸。读取外壳状态用 `useAdminStore(store)`，翻译外壳文案用 `useAdminText()`。

## Vue

```ts
// shell.ts
export const shell = createAdminShell<Component>({
  brand: { title: '工作台' },
  navigate: url => void router.push(url)
});

// main.ts：先 shell.attach() 再 createApp(App).mount()
```

```vue
<template>
  <AdminShellProvider :shell="shell">
    <AdminLayout :menu="menu" :navigating="navigating" :url="route.fullPath">
      <template #brand-icon><Database :size="16" /></template>
      <template #menu-extra="{ node }">
        <span class="badge badge-ghost badge-xs">{{ counts[node.id] }}</span>
      </template>
      <RouterView />
    </AdminLayout>
  </AdminShellProvider>
</template>
```

菜单是 `MenuNode<Component>[]`，图标用 `@lucide/vue` 组件，外壳按 16px 渲染。React 的 `brandIcon` / `renderMenuExtra` / `headerStart` / `headerEnd` 在 Vue 里是插槽 `brand-icon` / `menu-extra`（作用域参数 `{ node }`）/ `header-start` / `header-end`。读取外壳状态用 `useAdminStore(store)`（返回只读 `ref`），翻译用 `useAdminText()`。

**外壳不要放进 `ref()` / `reactive()`**：它是带 `#private` 字段的类实例，Vue 的深层代理读不到私有字段；`AdminShellProvider` 的 `shell` 在组件生命周期内不可替换，需要替换时给 Provider 加 `key`。

## Angular

```ts
export const shell = createAdminShell<AdminIcon>({
  brand: { title: '工作台' },
  navigate: url => void router.navigateByUrl(url)
});

bootstrapApplication(App, { providers: [provideZonelessChangeDetection(), provideAdminShell(shell)] });
```

```html
<rxdb-admin-layout [menu]="menu" [menuExtra]="extra" [navigating]="navigating()" [url]="url()">
  <svg [lucideIcon]="Database" [size]="16" brandIcon></svg>
  <router-outlet *rxdbAdminPage />
</rxdb-admin-layout>
<ng-template #extra let-node><span class="badge badge-ghost badge-xs">0</span></ng-template>
```

`provideAdminShell(shell)` 在环境初始化时（早于任何组件渲染）绑定浏览器。菜单是 `MenuNode<AdminIcon>[]`（`AdminIcon` 即 `@lucide/angular` 的图标输入），**须是稳定引用**，外壳按 16px 渲染图标。读取外壳状态用 `injectAdminStore(store)`（返回 `Signal`），翻译用 `injectAdminText()`，都要在注入上下文里调用。

## API 对照

| 能力           | React                        | Vue                                 | Angular                                       |
| -------------- | ---------------------------- | ----------------------------------- | --------------------------------------------- |
| 提供外壳       | `<AdminShellProvider shell>` | `<AdminShellProvider :shell>`       | `provideAdminShell(shell)`                    |
| 读取外壳       | `useAdminShell()`            | `useAdminShell()`                   | `injectAdminShell()`                          |
| 订阅存储       | `useAdminStore(store)` → 值  | `useAdminStore(store)` → 只读 `ref` | `injectAdminStore(store)` → `Signal`          |
| 外壳文案       | `useAdminText()`             | `useAdminText()`                    | `injectAdminText()`                           |
| 布局           | `<AdminLayout>`              | `<AdminLayout>`                     | `<rxdb-admin-layout>`                         |
| 菜单图标类型   | `ReactNode`                  | `Component`                         | `AdminIcon`                                   |
| 路由出口       | `children`                   | 默认插槽                            | 默认投影；刷新重建需 `*rxdbAdminPage`         |
| 品牌图标       | `brandIcon`                  | 插槽 `brand-icon`                   | 投影 `[brandIcon]`                            |
| 菜单项附加内容 | `renderMenuExtra(node)`      | 插槽 `menu-extra`（`{ node }`）     | 输入 `menuExtra`（`TemplateRef`，`let-node`） |
| 顶栏扩展       | `headerStart` / `headerEnd`  | 插槽 `header-start` / `header-end`  | 投影 `[headerStart]` / `[headerEnd]`          |

### 刷新 = 重挂载

顶栏与页签右键的「刷新」要重新创建页面内容。React 与 Vue 在页面容器上用 `key`，路由出口随之重建。Angular 的 `<ng-content>` 投影内容归父视图所有，布局无法重建，所以要把页面内容放进 `*rxdbAdminPage`，由布局以模板方式实例化；不用该指令、直接投影内容时，刷新只重建 `.admin-page` 容器，投影内容本身不会被重建。

## 测试

`@aiao/rxdb-admin/testing` 提供不依赖浏览器的假窗口、假文档与 `createTestShell`，三端的组件单测都基于它。Vue 里用 `@vue/test-utils` 挂载时不要把外壳经 `props` 传入（VTU 会深层代理 props，私有字段读不到），改用渲染函数闭包提供。
