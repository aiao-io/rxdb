/**
 * @fileoverview RxDB Workspace 插件
 * 工作空间插件，为尚未入库的 NEW 实体草稿提供本地恢复能力
 *
 * 主要功能：
 * - NEW 草稿缓存（`list()` / `discard()`）
 * - IndexedDB 持久化与安装时自动恢复
 * - 跨标签页同步（BroadcastChannel）
 * - 变更监听（`changes$`）与自动保存（`autoSave` / `flush()`）
 *
 * @module rxdb-plugin-workspace
 */

export {
  WorkspaceFlushError,
  rxDBPluginWorkspace,
  type RxDBPluginWorkspaceOptions,
  type WorkspaceCacheEntry,
  type WorkspaceCacheId,
  type WorkspaceCorruptedEntry
} from './RxDBPluginWorkspace.js';
