/**
 * DevTools Panel 类型定义
 */
import type { EntityDataPayload } from '@aiao/rxdb-devtools';

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

/**
 * 实体数据 —— 直接复用协议定义。
 *
 * @remarks
 * 面板过去自己抄了一份，抄漏了 `_meta`（结构化错误码就在里面），于是「对端没注册这个实体」
 * 只能靠匹配错误文案识别。协议形状一律由核心包说了算，与 `shared/types.ts` 同一条规矩。
 */
export type EntityData = EntityDataPayload;

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

/**
 * 实体查询失败的结构化类别 —— 给 UI 用的**判别位**，由协议的 `_meta.errorCode` 映射而来。
 *
 * @remarks
 * 与 {@link OpfsErrorKind} 同一个角色：UI 只认这个枚举，绝不匹配错误文案。
 * - `entity-not-found` —— 对端根本没注册这个实体（例如页面没装对应插件）。
 *   这是一个**可解释的正常状态**，不该按错误渲染；
 * - `entity-ambiguous` —— 实体名在多个 namespace 下重名，请求需要带上 namespace；
 * - `rxdb-not-ready` —— 对端 RxDB 还没 init；
 * - `keyring-locked` —— 密钥环未解锁，密文列读不出来；
 * - `unknown` —— 其余一切（含连接器比面板新时的未知码），只做展示，不驱动分支。
 */
export type EntityErrorKind = 'entity-not-found' | 'entity-ambiguous' | 'rxdb-not-ready' | 'keyring-locked' | 'unknown';
