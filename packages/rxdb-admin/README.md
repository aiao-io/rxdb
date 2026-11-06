# @aiao/rxdb-admin

后台外壳的无头核心：**偏好中心**（声明式 schema）、主题、布局推导、页签、快捷键、命令面板、扩展偏好项、锁屏、水印、时区。与路由库和 UI 框架无关，三端壳 `@aiao/rxdb-admin-react` / `-vue` / `-angular` 只负责渲染。

```bash
npm install @aiao/rxdb @aiao/rxdb-admin
```

外壳文案目录依赖 `@aiao/rxdb-i18n`（随本包安装），后者以 `@aiao/rxdb` 为 peer，所以需要一并安装 `@aiao/rxdb`。

```ts
import { createAdminShell, pickThemes } from '@aiao/rxdb-admin';

export const shell = createAdminShell({
  brand: { title: '工作台' },
  navigate: url => router.navigate(url), // 外壳不依赖路由库，跳转由应用提供
  storagePrefix: 'aiao.workbench', // 同源多应用时隔离存储键
  themes: pickThemes(['light', 'dark', 'cupcake', 'dracula']) // 必须与样式里启用的 daisyUI 主题一致
});
```

路由变化后调用 `shell.syncRoute(url)`（绑定组件会代劳），外壳据此同步页签、标题、面包屑并收起移动端抽屉。菜单用 `MenuNode` 树描述，图标类型由绑定决定（React 的 `ReactNode`、Vue 的 `Component`、Angular 的 lucide 图标数据）。

## 偏好与持久化

偏好是一棵类型化的状态树（`AdminPreferences`：外观、布局、侧栏、导航、顶栏、面包屑、页签、页脚、版权、Logo、切换动画、快捷键、部件、扩展），每一项都由 `PreferenceItem` 声明，偏好抽屉按 schema 通用渲染，没有手写表单。

- 存储只落**相对默认值的差异**（`{ version: 1, values }`，键 `<storagePrefix>.preferences`），应用升级后调整默认值，未改动过的用户自动跟随。
- 同源多标签通过 `storage` 事件同步，页面隐藏（`pagehide`）时落盘；`exportJson()` 导出差异，`importJson()` 整体替换。
- 所有写入（界面、导入、其他标签）都经过同一套约束清洗，状态树始终合法。
- `defaults` 覆盖包内默认值，`migrateLegacy` 在首次使用时把旧存储键迁移进来：

```ts
createAdminShell({
  // ...
  defaults: { navigation: { accordion: false } },
  migrateLegacy: storage => (storage.getItem('theme') === 'dark' ? { theme: { name: 'dark' } } : null)
});
```

## 扩展偏好项

业务自己的设置项注册为扩展，出现在偏好抽屉的「拓展」页签，值存放在 `extension.<key>`：

```ts
createAdminShell({
  // ...
  extensions: [
    {
      key: 'searchPageSize',
      type: 'number', // 'switch' | 'text' | 'select' | 'number'
      label: '全文搜索每页条数',
      section: '全文搜索',
      defaultValue: 20,
      min: 5,
      max: 50,
      step: 5
    }
  ]
});

shell.preferences.value.extension['searchPageSize']; // 读取
shell.preferences.setPath('extension.searchPageSize', 10); // 写入（同样被清洗、持久化、跨标签同步）
```

## 首屏无闪烁

主题与布局变量要在框架渲染之前就位。把生成的脚本内联进 `index.html` 的 `<head>`，并在入口里先调用 `shell.attach()` 再渲染：

```ts
import { createBootstrapScript } from '@aiao/rxdb-admin';

createBootstrapScript({ storageKey: 'aiao.workbench.preferences' }); // 返回要内联的脚本文本
```

建议在应用的单测里断言 `index.html` 含有这段脚本，防止存储键或逻辑漂移。

## 命令面板、快捷键、命令

```ts
// 异步来源：例如对接全文搜索，命中后跳转
shell.palette.registerSource({
  id: 'records',
  groupLabelKey: 'palette.group.records',
  minQueryLength: 1,
  search: async (query, signal) => [{ id: 'r1', label: '命中的记录', run: () => shell.navigate('/records/1') }]
});

shell.registerCommand({ id: 'sync', label: '立即同步', keywords: ['sync'], run: () => sync() });
shell.shortcuts.register({ id: 'sync', combo: 'Mod+Shift+S', label: '立即同步', handler: () => sync() });
```

`Mod` 在 macOS 是 ⌘，其他平台是 Ctrl；含 Alt 的组合按物理键位（`event.code`）匹配，避免 macOS 上 ⌥L 变成 `¬`。内置：`Mod+K` 命令面板、`Mod+,` 偏好设置、`Alt+L` 锁屏、`Mod+B` 折叠侧栏、`Alt+W` 关闭页签。

## 布局与样式契约

四种布局模式（`sidebar-nav`、`header-sidebar-nav`、`header-nav`、`full-content`）由 `shell.layout` 推导：侧栏折叠为图标轨、悬停展开、拖拽调宽、移动端抽屉、内容最大化等状态都已算好，绑定只按它渲染。

三端壳共享同一份样式契约 `@aiao/rxdb-admin/admin.css`：全部位于 `@layer components`，只使用 daisyUI 的主题变量，应用可以在更高层覆盖。应用需自行启用 Tailwind 与 daisyUI，并在入口引入绑定包的 `tailwind.css`（让 Tailwind 扫描组件里用到的类）和本文件。

## 国际化

外壳文案在命名空间 `rxdb-admin` 下，随包提供 `zh-Hans` 与 `en`。默认使用只含外壳目录的静态运行时；应用已有 `@aiao/rxdb-i18n` 运行时时，把 `adminMessages` 加入它的 `catalogs` 并通过 `i18n` 选项传入，语言切换即全站联动。

## 锁屏的边界

锁屏是「防偷看」而不是安全边界：密码以 PBKDF2-SHA256（Web Crypto）加盐哈希后存放在本机，数据本身并未加密；环境缺少 `crypto.subtle`（非 HTTPS 且非 localhost）时设置密码直接报错，不会退让为弱哈希。

## 测试

`@aiao/rxdb-admin/testing` 提供不依赖浏览器的假窗口 / 假文档与 `createTestShell`，用于单测快捷键、页签、偏好持久化和绑定组件。
