# Applications 管理设计拆解

日期：2026-11-13

这份记录把 [ADESK-US-205](../stories/application/ADESK-US-205-application-management.md) 和 [ADESK-US-206](../stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 映射到当前 `aiao-desktop` 代码，作为实现前的范围评审材料。它不替代两个 story 的验收标准。

## 目标模型

把应用看成一个由清单描述、由运行时装载、由系统目录投影的对象：

```text
AppManifest
  ├─ identity       appId / bundleId / name / icon
  ├─ placement      Applications / Launchpad / Spotlight / Dock
  ├─ install        preinstalled / managed / user + removable
  ├─ runtime        builtin-component / bundled-html / remote-web
  ├─ window         size / single / frame
  ├─ capabilities   window / menu / app / appearance / notification / clipboard / filesystem
  └─ loader         dynamic import / same-origin entry / Orbit entry

ApplicationCatalog
  ├─ Applications .app 投影
  ├─ stable appId 解析
  ├─ protected path 判断
  └─ launch source validation

ApplicationRuntime
  ├─ loading / ready / minimized / failed / closed
  ├─ component / bundled iframe / Orbit iframe
  └─ DesktopAppContext

DockLayoutStore
  ├─ pinned order
  ├─ running transient items
  ├─ protected system items
  └─ pointer drag insertion
```

“预装”只表示应用属于系统清单、可见且受保护；“预装”不表示代码已经进入首屏，也不表示 iframe 已经创建。`saltline.html` 是 `bundled-html`，Aiao Code 是 `remote-web`，普通 Angular 应用是 `builtin-component`，三者都按需运行。

## 当前代码到目标模块

| 当前位置 | 当前职责 | 目标调整 |
| --- | --- | --- |
| `apps/web/src/app/apps/app-manifests.ts` | 应用纯数据清单 | 增加稳定 bundle 标识、安装来源、Applications/Launchpad/Spotlight/Dock 展示策略、运行类型与能力清单；保持不依赖 Angular |
| `apps/web/src/app/apps/registry.ts` | 静态导入并绑定所有组件 | 只绑定 lazy loader；组件实现通过 dynamic import 分 chunk，remote 和 bundled 入口不在 shell 中执行 |
| `apps/web/src/app/services/desktop-apps.ts` | 应用类型、入口校验、Orbit 来源推导 | 扩展为清单 schema、安装范围、保护规则、能力校验与运行类型校验 |
| `apps/web/src/app/disk/disk-seed.ts` | 手工 `APPLICATIONS` 列表和 `.app` 元数据种子 | 删除重复列表；由 `ApplicationCatalog` 从 manifest 幂等生成 `.app` 包元数据，不能覆盖用户文件 |
| `apps/web/src/app/services/file-system.ts` | 根目录、System、主目录的路径保护 | 委托 `ApplicationCatalog` 判断受保护应用包，Finder、终端同步、删除和移动共用一条规则 |
| `apps/web/src/app/services/file-opener.ts` | 用显示名反查应用 id | 读取 `.app` 的稳定 bundle 标识或目录投影携带的 `appId`，只按稳定标识启动 |
| `apps/web/src/app/components/dock.ts` | `DOCK_ITEMS` 硬编码、静态槽位 | 从 `DockLayoutStore` 计算固定项、运行中临时项和系统项；保留 `DockState.rectFor()` 作为窗口动画接口 |
| `apps/web/src/app/services/system-settings.ts` | 将 Dock 尺寸和放大保存为一行设置 | 增加独立、可校验的 Dock 布局偏好，避免布局与外观参数互相污染 |
| `apps/web/src/app/components/overlays/launchpad.ts` | 从 `LAUNCH_ORDER` 渲染，Add to Dock 无动作 | 从清单投影应用；Add to Dock 调用统一 Dock store，并与拖放行为相同 |
| `apps/web/src/app/apps/finder/finder.ts` / `finder.html` | `.app` 可打开，但没有应用拖放 | Applications 中的 `.app` 节点携带 appId，支持拖入 Dock；保护状态影响菜单和拖放反馈 |
| `apps/web/src/app/services/window-manager.ts` | 创建并直接挂载组件 | 只管理窗口实例和状态，组件、bundled iframe、Orbit iframe 由 `ApplicationRuntime` 装载 |
| `apps/web/src/app/services/orbit-host.ts` | 集成应用 Orbit 宿主 | 保留精确来源和 ready 规则，只负责 remote-web adapter；能力请求归一到 `DesktopAppContext` |
| `apps/web/src/app/data/seeds.ts` | 静态导入全部应用种子 | 按应用/数据域拆成 lazy seed loader，打开功能前不执行其他应用的 seed |

## 实施切片

1. **清单和目录模型**：先补齐 manifest schema 与纯函数校验，定义 `appId`、`bundleId`、安装来源、受保护状态和四个展示面。把 `saltline`、Aiao Code 与现有内置应用全部映射到目标模型。
2. **Applications 投影和保护**：让 `.app` 元数据从清单派生，新增应用目录服务；把 Finder、终端同步和文件系统删除/移动的保护判断接到同一个服务。先覆盖预装应用，用户安装应用留作后续故事。
3. **Dock 布局和拖放**：把默认硬编码数组迁移为种子布局，增加持久化、固定/取消固定、运行中临时项和内部指针拖放协议。再接 Finder 与 Launchpad 的入口。
4. **运行时抽象**：引入 `ApplicationRuntime`，让 `WindowManager` 只持有窗口和生命周期；组件、同源 HTML iframe、Orbit iframe 分别实现 adapter，确保打开才装载、关闭必销毁。
5. **宿主能力**：定义 `DesktopAppContext` 的能力名、版本、权限和错误码；内置应用先用 facade 接现有服务，Orbit 应用通过 RPC 接同一协议，bundled HTML 通过受信 bridge 接入。
6. **数据和性能门禁**：拆分静态应用 seed，构建后检查 shell chunk 不包含应用实现；浏览器网络记录检查启动阶段没有 remote URL、bundled HTML 和非当前应用 chunk；再补完整冒烟与回归。

## 必须先定下来的实现约束

- `Applications` 不是另一套应用注册表。任何可以从 Applications 打开的应用必须先存在 manifest，磁盘里的 `.app` 只做系统投影和用户可见元数据。
- `appId` 是内部身份，显示名可以本地化或修改；任何启动入口都不能依赖显示名。
- `remote-web` 仍只能加载登记表中的精确 HTTPS Origin；拖入 Dock 只能传递 appId，绝不能把任意 URL 变成桌面应用。
- `bundled-html` 只接受构建产物里的相对入口；同源 iframe 可使用 pointer lock 等游戏能力，但不能被描述为安全沙箱。
- Dock 布局只保存固定关系，不保存窗口实例；窗口跨刷新恢复仍是独立故事。
- `DesktopAppContext` 必须实例绑定并做能力校验；不能把 `FileSystem`、RxDB repository、OPFS handle 或父页面 DOM 直接交给 remote-web。
- 所有用户偏好读取都要经过 schema 校验；缺失、重复、未知 appId 只能被清理，不能让 Dock 生成重复图标或阻止桌面启动。

## 评审结论

✅ 值得做：它直接修复当前 Applications 与 registry 脱节、Dock 硬编码、Launchpad 空操作和首屏静态打包四个结构问题，也为更多内置应用与远程应用提供同一条接入路径。

⚠️ 需要分阶段交付：应用目录安装/更新/回退、任意第三方应用安全隔离和完整文件选择服务不能与本故事一起承诺；先把预装清单、受管远程应用、懒加载、Dock 管理和最小系统能力跑通。
