# 偏好、主题与扩展

外壳的所有可配置项都是一棵类型化的偏好树 `AdminPreferences`，每一项由一个 `PreferenceItem` 声明（路径、控件、页签、分区、约束）。偏好抽屉按 schema 渲染五个页签：外观、布局、快捷键、通用、拓展。

## 创建外壳

```typescript
import { createAdminShell, pickThemes } from '@aiao/rxdb-admin';

export const shell = createAdminShell({
  brand: { title: '工作台' },
  navigate: url => router.navigate(url),
  storagePrefix: 'aiao.workbench',
  themes: pickThemes(['light', 'dark', 'cupcake', 'dracula'])
});
```

| 选项            | 说明                                                                 |
| --------------- | -------------------------------------------------------------------- |
| `navigate`      | 路由跳转；外壳与路由库无关                                           |
| `brand`         | 应用名：用于侧栏 / 顶栏、动态标题与水印默认文案                      |
| `themes`        | 可选主题，必须与样式里启用的 daisyUI 主题一致，缺省 `light` / `dark` |
| `defaults`      | 应用级默认偏好，覆盖包内默认值                                       |
| `extensions`    | 业务扩展偏好，显示在「拓展」页签                                     |
| `migrateLegacy` | 首次使用时从旧存储键迁移偏好                                         |
| `storagePrefix` | 存储键前缀，同源多应用时隔离，缺省 `aiao.admin`                      |
| `i18n`          | 应用自己的国际化运行时；缺省使用只含外壳文案的静态运行时             |
| `homeUrl`       | 首页地址，关闭最后一个页签后回到这里，缺省 `/`                       |

## 存储与同步

偏好只存**相对默认值的差异**：键 `<storagePrefix>.preferences`，内容 `{ "version": 1, "values": { ... } }`。因此应用升级后调整默认值，未改动过的用户自动跟随；"重置"就是清掉这个键。

- **多标签**：同源其他标签页写入后，通过 `storage` 事件同步到当前页。
- **落盘时机**：写入防抖；页面隐藏（`pagehide`）时若本实例有未保存的改动立即落盘，不会拿旧快照覆盖其他标签刚写入的值。
- **清洗**：界面、导入、其他标签页的写入都经过同一套约束（范围、枚举、必填），状态树始终合法。
- **导出 / 导入**：抽屉页脚的"复制配置 / 导入配置"收发差异 JSON，例如 `{"theme":{"name":"dracula"}}`；导入整体替换当前偏好，非法 JSON 或非对象给出错误提示且不改动。

### 应用默认值与旧键迁移

```typescript
createAdminShell({
  // ...
  defaults: { navigation: { accordion: false } },
  migrateLegacy: storage => {
    const theme = storage.getItem('theme');
    return theme === 'light' || theme === 'dark' ? { theme: { name: theme } } : null;
  }
});
```

`migrateLegacy` 只在新键不存在时调用一次，返回要并入偏好的补丁；返回 `null` 表示没有可迁移内容。迁出来的偏好会立即写入新键，之后以新键为准，旧键再变化也不影响。

## 首屏无闪烁

主题和布局变量必须在框架渲染前就位。核心包生成一段与外壳逻辑同源的内联脚本，放进 `index.html` 的 `<head>`，并在入口里先 `shell.attach()` 再渲染：

```typescript
import { createBootstrapScript } from '@aiao/rxdb-admin';

// 返回要内联进 <head> 的脚本文本
createBootstrapScript({ storageKey: 'aiao.workbench.preferences' });
```

建议在应用单测里断言 `index.html` 含有这段脚本，防止存储键或逻辑漂移（`apps/dev-rxdb-admin` 的 `workbench-shell.spec.ts` 是现成写法）。

## 主题

主题名来自 daisyUI 目录；外壳把选择换算成根节点的 `data-theme`、`color-scheme` 与 CSS 变量（主色、圆角、字号）。`system` 跟随系统明暗，在亮 / 暗两个主题间解析。主色会自动选择对比度足够的前景色；半深色侧栏 / 顶栏使用可选主题里的深色主题。

模型表格（VTable）画在 canvas 上，不读 CSS 变量：`@aiao/rxdb-model` 系列通过 `isDocumentDarkMode()` 读取根节点计算后的 `color-scheme`，并用 `observeDocumentTheme()` 在主题变化时通知三端表格重绘，所以任何 daisyUI 深色主题下表格都不会停留在白底。

## 扩展偏好项

业务自己的设置项注册为扩展，值存放在 `extension.<key>`，同样被清洗、持久化、跨标签同步。支持 `switch`、`text`、`select`、`number` 四类：

```typescript
createAdminShell({
  // ...
  extensions: [
    {
      key: 'searchPageSize',
      type: 'number',
      label: '全文搜索每页条数',
      hint: '搜索页每次加载的结果数，修改后立即生效',
      section: '全文搜索',
      defaultValue: 20,
      min: 5,
      max: 50,
      step: 5
    }
  ]
});
```

读取与写入：

```typescript
shell.preferences.value.extension['searchPageSize'];
shell.preferences.setPath('extension.searchPageSize', 10);
```

绑定层用各自的响应式桥接订阅 `shell.preferences`，值变化时组件自动更新（见[三端用法](./frameworks.md)）。

## 命令面板、快捷键与命令

```typescript
// 异步来源：例如对接全文搜索，命中后跳转
shell.palette.registerSource({
  id: 'records',
  groupLabelKey: 'palette.group.records',
  minQueryLength: 1,
  search: async (query, signal) => [
    {
      id: 'record:1',
      label: '命中的记录',
      sublabel: '资产分类 · name',
      run: () => shell.navigate('/entities/assets/AssetCategory')
    }
  ]
});

shell.registerCommand({ id: 'sync', label: '立即同步', keywords: ['sync'], run: () => sync() });
shell.shortcuts.register({ id: 'sync', combo: 'Mod+Shift+S', label: '立即同步', handler: () => sync() });
```

- `Mod` 在 macOS 是 ⌘，其他平台是 Ctrl；含 Alt 的组合按物理键位（`event.code`）匹配。
- 来源可声明 `minQueryLength`，查询被新输入取代时会收到 `signal` 的取消。
- 来源如果用 `@aiao/rxdb-plugin-search` 的句柄，等 `state$` 结算后再读 `results$`，不要用 `combineLatest` 合并两者——它们派生自同一份快照，状态先到、结果还是旧值。

## 锁屏的边界

锁屏是"防偷看"，不是安全边界：密码以 PBKDF2-SHA256（Web Crypto）加盐哈希后存放在本机，锁定状态持久化并跨标签同步，但**业务数据并未加密**。需要加密数据请使用 `@aiao/rxdb-adapter-encrypted`。环境缺少 `crypto.subtle`（非 HTTPS 且非 localhost）时设置密码直接报错，不会退让为弱哈希。

## 国际化

外壳文案在命名空间 `rxdb-admin` 下，随包提供 `zh-Hans` 与 `en`。默认使用只含外壳目录的静态运行时；应用已有 `@aiao/rxdb-i18n` 运行时时，把核心包导出的 `adminMessages` 加入它的 `catalogs` 并通过 `i18n` 选项传入，语言切换即全站联动。

## 样式契约

`@aiao/rxdb-admin/admin.css` 是三端共享的样式契约：绝大部分位于 `@layer components`，只使用 daisyUI 的主题变量，应用可以在更高的层里覆盖。需要压过 daisyUI 的少数覆盖（偏好抽屉未选中页签的前景色、侧栏菜单的宽度 / 圆角 / 图标轨）位于文件末尾的 `@layer utilities`：daisyUI 的规则在 `utilities` 的子层里，`components` 层写多高的特异性都会输；应用自己覆盖 daisyUI 的子组件样式时同理，要写在 `utilities` 本层。
