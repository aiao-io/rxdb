# RxDB DevTools Extension (Angular)

Chrome DevTools 扩展（Manifest V3），用于检查任意接入 [`@aiao/rxdb-devtools`](../../packages/rxdb-devtools) 的本地优先应用：实时事件流、数据库/实体数据、分支管理、OPFS 文件浏览与存储管理。UI 使用 Angular 21 + signals + daisyUI/Tailwind。

## 功能面板

- **Events** —— 实时 RxDB 事件流与详情
- **Database** —— 数据库信息、实体列表与数据查询
- **OPFS** —— 浏览 / 上传 / 下载 / 删除 OPFS 文件与目录
- **Storage** —— `StorageFileMeta` 存储元数据
- **Settings** —— 主题、打包下载数据库（tar）、清理本地数据

## 架构

三层，通过统一消息协议（`@aiao/rxdb-devtools`）通信：

```text
被检查页面 (@aiao/rxdb-devtools connector)
        │  window.postMessage
        ▼
content/bridge.ts        ── 页面 ↔ 扩展 消息桥接（document_start）
content/opfs-content.ts  ── 在页面上下文操作 OPFS（document_idle）
        │  chrome.runtime
        ▼
background/index.ts      ── 按 tabId 路由 Panel ↔ Content
        │  chrome.runtime.Port
        ▼
devtools/ (Angular Panel) ── UI + services（PortService / *StateService / OpfsService）
```

- 破坏性操作（清库 / 打包下载）通过 `chrome.devtools.inspectedWindow.eval` 注入自包含函数到页面主世界执行，结果经 `window.postMessage` 回传（见 `devtools/scripts/`）。
- 握手容错：面板连接后由 background 发 `PING`，页面 connector 重发 `HANDSHAKE`，未连接期间事件在页面侧缓冲。

## 开发

```bash
# 开发（HMR）
pnpm nx serve rxdb-devtools-extension        # 或 dev

# 生产构建 → dist/，并打包 release/crx-*.zip
pnpm nx build rxdb-devtools-extension

# 质量门禁
pnpm nx run rxdb-devtools-extension:typecheck
pnpm nx run rxdb-devtools-extension:lint
pnpm nx run rxdb-devtools-extension:test
```

加载到 Chrome：`chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择 `dist/`。随后对目标页面打开 DevTools，切到 **RxDB** 面板。

## 已知限制

- **打包下载数据库**：`downloadDatabase` 会将整个 OPFS 读入内存再生成 tar；库很大时占用较高。为避免打断运行中的应用，下载**不**预先断开 RxDB，热文件（如 SQLite WAL）可能产生轻微不一致的快照。
- **文件上传**：经 base64 走消息通道传输，超大文件较慢（>50MB 会有提示）。
- **清理所有数据**：会清空被检查源下的 **RxDB + OPFS + IndexedDB + localStorage**，不仅限 RxDB，且不可撤销。
- **权限**：首次检查站点时按当前 origin 请求可选 host 权限；导航到新 origin 后重新判定。
