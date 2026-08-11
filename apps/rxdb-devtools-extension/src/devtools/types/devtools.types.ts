/**
 * DevTools Panel 类型定义
 */

/** 序列化事件 */
export interface SerializedEvent {
  id: string;
  eventType: string;
  timestamp: number;
  sequence: number;
  data: Record<string, unknown>;
}

/** 分支信息 */
export interface Branch {
  id: string;
  activated: boolean;
}

/** 实体信息 */
export interface EntityInfo {
  name: string;
  namespace: string;
  encryptedFields: string[];
}

/** 数据库信息 */
export interface DbInfo {
  version: string;
  dbName: string;
  entities: EntityInfo[];
}

/** 实体数据 */
export interface EntityData {
  entityName: string;
  namespace?: string;
  error: string | null;
  data: unknown[];
}

/** OPFS 文件 */
export interface OPFSFile {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified?: number;
  path: string;
}

/** 主题类型 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * OPFS 操作失败的结构化类别。
 *
 * @remarks
 * P1-5：给 UI 用的**判别位**，取代对错误文案的 `includes()` 匹配。
 * - `content-script-unavailable` —— content script 尚未注入 / 通道已关闭，用户需要刷新被检查页面；
 * - `unknown` —— 其余一切错误，只做展示，不驱动分支。
 */
export type OpfsErrorKind = 'content-script-unavailable' | 'unknown';
