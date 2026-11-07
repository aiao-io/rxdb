# @aiao/rxdb-admin-vue

`@aiao/rxdb-admin` 的 Vue 3 绑定：`AdminLayout`（侧栏 / 顶栏 / 页签栏 / 内容区 / 页脚）、偏好抽屉、命令面板、锁屏与水印。外壳由应用用 `createAdminShell` 创建，组件只负责渲染；DOM 结构、类名与 `data-testid` 与 React / Angular 绑定一致。

## 样式

需要应用自己启用 Tailwind 与 daisyUI。在样式入口引入本包的 Tailwind 源注册和外壳样式契约（后者来自核心包）：

```css
@import 'tailwindcss';
@import '@aiao/rxdb-admin-vue/tailwind.css';
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

外壳要在组件之外创建，并先 `attach()` 再挂载，这样主题、布局变量第一帧就位：

```ts
// shell.ts
import { createAdminShell } from '@aiao/rxdb-admin';
import type { Component } from 'vue';
import { router } from './router';

export const shell = createAdminShell<Component>({
  brand: { title: '工作台' },
  navigate: url => void router.push(url)
});
```

```ts
// main.ts
import { shell } from './shell';

shell.attach();
createApp(App).use(router).mount('#app');
```

```vue
<script lang="ts" setup>
import { AdminLayout, AdminShellProvider } from '@aiao/rxdb-admin-vue';
import { Database } from '@lucide/vue';
import { useRoute } from 'vue-router';
import { menu } from './menu';
import { shell } from './shell';

const route = useRoute();
</script>

<template>
  <AdminShellProvider :shell="shell">
    <AdminLayout :menu="menu" :url="route.fullPath">
      <template #brand-icon><Database :size="16" /></template>
      <template #menu-extra="{ node }">
        <span class="badge badge-ghost badge-xs">{{ counts[node.id] }}</span>
      </template>
      <RouterView />
    </AdminLayout>
  </AdminShellProvider>
</template>
```

菜单是 `MenuNode<Component>[]`，图标用 `@lucide/vue` 的组件（用 `markRaw` 或放在模块作用域，不要让 Vue 深层代理它们）。

`AdminShellProvider` 在挂载期间绑定浏览器（快捷键、主题、布局变量、标题），`attach` 幂等；它的 `shell` 在组件生命周期内不可替换，需要替换时给 Provider 加 `key`。**不要把外壳放进 `ref()` / `reactive()`**：外壳是带 `#private` 字段的类实例，深层代理读不到私有字段；需要响应式持有时用 `shallowRef` 或 `markRaw`。

## `AdminLayout`

| 属性 / 插槽                 | 说明                                                    |
| --------------------------- | ------------------------------------------------------- |
| `menu`                      | `MenuNode<Component>[]` 导航菜单                        |
| `url`                       | 当前地址（路径 + 查询串），变化时同步页签 / 标题        |
| `navigating`                | 导航进行中，驱动顶部进度条与加载遮罩                    |
| 默认插槽                    | 路由出口；顶栏与页签右键的「刷新」会重新挂载它          |
| `brand-icon`                | 没有 Logo 图片时的品牌图标                              |
| `menu-extra`                | 菜单项右侧附加内容（徽标、计数），作用域参数 `{ node }` |
| `header-start`/`header-end` | 顶栏部件区之前 / 之后的扩展内容                         |

## Composables

- `useAdminShell()`：读取最近的外壳，缺少 Provider 时抛错。
- `useAdminStore(store)`：订阅外壳暴露的任一可读存储（`shell.preferences`、`shell.layout`、`shell.tabs`……），返回只读 `ref`，组件卸载时自动退订。
- `useAdminText()`：翻译外壳文案的函数，语言或目录变化时模板重新渲染。

```ts
const prefs = useAdminStore(shell.preferences);
const pageSize = computed(() => prefs.value.extension['searchPageSize'] as number);
```

## 其他导出

`Sidebar` / `Brand`、`Header` / `HeaderMenu` / `Breadcrumb`、`Tabbar`、`HeaderWidgets`、`PreferencesDrawer`、`CommandPalette`、`LockScreen`、`Watermark`、`Footer`、`MenuTree` 都可单独使用，用来搭建自定义外壳；`AdminLayout` 是它们的默认组合。命令面板、偏好抽屉与锁屏使用原生 `<dialog>`，焦点陷阱、Esc 与背景惰性由浏览器负责。

## 测试

用 `@vue/test-utils` 挂载时不要把外壳经 `props` 传入（VTU 会深层代理 props，外壳的私有字段读不到），改用渲染函数闭包提供：

```ts
mount(defineComponent({ render: () => h(AdminShellProvider, { shell }, () => h(AdminLayout, { menu, url })) }));
```

`@aiao/rxdb-admin/testing` 的 `createTestShell` 提供不依赖浏览器的假窗口 / 假文档。
