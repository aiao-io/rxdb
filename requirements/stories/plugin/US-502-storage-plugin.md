---
id: US-502
title: Storage 插件
status: Done
priority: Medium
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-05-15
tags: [plugin, storage, opfs, remote-cache]
---

# 用户故事：Storage 插件

## 作为/我想要/以便

**作为** 需要管理本地文件的开发者
**我想要** 在浏览器中上传、下载和预览文件，使用 OPFS 本地存储，并能把互联网静态资源按需镜像到 OPFS
**以便** 支持离线文件访问、高性能本地文件管理，以及远程静态资源的"首次联网 → 后续离线命中"缓存

## 验收标准

| #   | 前置条件                    | 操作                      | 预期结果                                          | 状态 |
| --- | --------------------------- | ------------------------- | ------------------------------------------------- | ---- |
| 1   | Storage 插件已安装          | 上传文件                  | 文件存储到 OPFS，元数据写入 RxDB                  | ✅   |
| 2   | OPFS 中有文件               | 下载文件                  | showSaveFilePicker / `<a>` 回退                   | ✅   |
| 3   | OPFS 中有图片               | 预览图片                  | 生成临时 Object URL，含 dispose()                 | ✅   |
| 4   | RxDB 元数据管理             | 查询文件列表              | 元数据通过 StorageFileMeta 管理                   | ✅   |
| 5   | 离线状态                    | 访问文件                  | 从 OPFS 本地读取，无需网络                        | ✅   |
| 6   | 插件遵循 `IRxDBPlugin` 接口 | 通过 factory 注册         | 符合插件架构规范                                  | ✅   |
| 7   | 目录管理                    | 创建/重命名目录           | OPFS 目录正确操作，路径规范化                     | ✅   |
| 8   | 文件监听                    | watch(fileId) 订阅        | RxJS Observable 响应式推送                        | ✅   |
| 9   | 目录浏览                    | listEntries()             | 返回文件与子目录混合条目                          | ✅   |
| 10  | 文件重命名                  | rename(fileId, newName)   | OPFS 文件移动 + 元数据更新                        | ✅   |
| 11  | OPFS 已存在该 opfsPath      | fetch(opfsPath, {url})    | 直接返回缓存 Blob，不发起网络请求                 | ✅   |
| 12  | OPFS 未命中 + 在线          | fetch(opfsPath, {url})    | 下载远程 → 写入 OPFS + StorageFileMeta，返回 Blob | ✅   |
| 13  | OPFS 未命中 + 离线          | fetch(opfsPath, {url})    | 抛 `StorageOfflineError`，不写入元数据            | ✅   |
| 14  | 远程返回非 2xx              | fetch(opfsPath, {url})    | 抛 `StorageFetchError`，不写入 OPFS               | ✅   |
| 15  | 已缓存条目                  | delete(fileId) 后再 fetch | 重新联网拉取并落盘                                | ✅   |

## 技术笔记

- 本地存储：OPFS (Origin Private File System) 高性能读写
- 元数据：`StorageFileMeta` 实体（name/mimeType/size/opfsPath/contentVersion），RxDB 管理，`opfs_path` 唯一索引
- 插件接口：`IRxDBPlugin` + `RxDBPluginBase`
- 离线优先：完全离线可用；`StorageFileMeta` 的 SyncType 由项目同步配置决定（本 story 不锁定），是否上行到远端属于上层策略
- Object URL 管理：`ObjectUrlRegistry` 追踪活跃 URL，`destroy()` 时全部释放
- 响应式监听：`watch(fileId)` 基于内部 `#changes$` Subject，初始值 + 变更推送

### 远程资源缓存（新增）

- API 签名：`fetch(opfsPath: string, options: { url: string; mimeType?: string }): Promise<Blob>`，`url` **必传**（调用方维护，不从 meta 反查）
- 策略：**OPFS-first**。先按 `opfsPath` 查 `StorageFileMeta`，命中即从 OPFS 读 Blob 返回；未命中则 `globalThis.fetch(url)` 下载 → 写入 OPFS → upsert `StorageFileMeta` → 返回 Blob
- 元数据始终落盘：未命中分支**必然**在 RxDB 中创建/更新 `StorageFileMeta`，确保「meta 在 storage 里」这一前提成立；同步通道是否启用由项目 SyncType 配置决定，本 story 不引入新字段（无 `remoteUrl`）
- Blob 不参与同步：远程缓存策略**只覆盖单机 OPFS**，blob 二进制不走 RxDB attachments；其他设备同步到 meta 后若需镜像同名 opfsPath，仍由各端调用方独立 `fetch(opfsPath, { url })`
- 缓存语义：**永久缓存**。不做 ETag/TTL 失效；需主动 `delete(fileId)` 或 `clear(path?)` 才刷新。后续若需 revalidate 走独立 story
- 离线检测：通过 `navigator.onLine === false` 或 fetch 抛 `TypeError`（网络失败）判定离线，统一映射为 `StorageOfflineError`
- 错误类型（新增导出）：
  - `StorageOfflineError extends Error` — OPFS 未命中且无法联网
  - `StorageFetchError extends Error` — 远程响应非 2xx，附带 `status` 字段
- 路径规范化：`opfsPath` 复用 `normalizeRelativeOpfsPath()`，自动创建中间目录；与 `upload({ path })` 行为对齐
- 三框架对称：service 层一次实现，Angular/React/Vue 绑定直接透传 Promise（与 `read`/`upload` 风格一致）；不引入新 hook/composable
- 与现有 API 关系：`fetch()` 返回 `Blob` 与 `read()` 一致；命中后可继续走 `createObjectUrl(fileId)` / `preview(fileId)` 生成预览 URL

## 实现文件

- `packages/rxdb-plugin-storage/` — Storage 插件
  - `plugin.ts` — `RxDBPluginStorage` / `rxdbStorage` factory / `rxdb.storage` 类型扩展
  - `storage.service.ts` — `RxdbFileStorage`（核心文件操作服务），AC #11-15 新增 `fetch(opfsPath, options)` 方法
  - `file-meta.entity.ts` — `StorageFileMeta` 实体
  - `object-url.ts` — `ObjectUrlRegistry` Object URL 生命周期管理
  - `errors.ts` — 新增 `StorageOfflineError` / `StorageFetchError`（AC #13、#14）

### 演示用例

- `apps/dev-rxdb-angular/` — 在 storage 演示页加入"远程图片缓存"分块：调用 `rxdb.storage.fetch('images/1.jpg', { url: 'http://static.aiao.io/images/1.jpg' })`，首次联网、二次离线命中

## 文档

- [网站文档](../../../website/docs/plugins/rxdb-plugin-storage/README.md)
