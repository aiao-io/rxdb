/**
 * 共享类型定义
 * 所有 background、content、devtools 脚本共用的核心类型
 */

export { RXDB_DEVTOOLS_MESSAGE } from '@aiao/rxdb-devtools';
import {
  isDevToolsMessage as isCoreDevToolsMessage,
  RXDB_DEVTOOLS_MESSAGE,
  type MessageType as CoreMessageType
} from '@aiao/rxdb-devtools';

/**
 * 只在扩展内部流通、核心库不认识的消息类型。
 *
 * @remarks
 * 核心库的 `isDevToolsMessage` 对这些类型一律 `return false`（它的 switch 有 `default`），
 * 所以扩展必须**自己给它们同等严格的规则** —— 见 `isExtensionOnlyMessage`。
 *
 * **已知的死协议面**：`BRANCH_SWITCHED` / `BRANCH_CREATED` / `BRANCH_DELETED` / `ERROR`
 * 这四个在全仓**没有任何产出点**（连接器对分支操作的回复走的是 `BRANCHES`，
 * 见 `packages/rxdb-devtools/src/connector.ts` 的 `#runBranchOp` → `#handleGetBranches`）。
 * 面板侧有 handler、spec 里有手工 emit，但没有真实发送方。
 * 本次仍保留并给出严格规则 —— **删协议面是行为决策，不该混进一次安全修复里**；
 * 清理另行立项。
 */
export type ExtensionOnlyMessageType =
  'INIT' | 'BRANCH_SWITCHED' | 'BRANCH_CREATED' | 'BRANCH_DELETED' | 'INSPECTED_WINDOW_SCRIPT_RESULT' | 'ERROR';

/** 扩展支持的核心消息与扩展内部消息类型并集。 */
export type ExtensionMessageType = CoreMessageType | ExtensionOnlyMessageType;

/**
 * background、content script、页面与 DevTools 面板之间传递的统一消息信封。
 *
 * @typeParam T - `payload` 的具体类型
 */
export interface DevToolsMessage<T = unknown> {
  source: typeof RXDB_DEVTOOLS_MESSAGE;
  direction: 'page-to-devtools' | 'devtools-to-page';
  type: ExtensionMessageType;
  payload: T;
  timestamp: number;
  sequence: number;
  tabId?: number;
}

/** 面板 → background 的握手。payload 恒为 `null`，真正的信息是 `tabId`。 */
export type InitMessage = DevToolsMessage<null> & { type: 'INIT'; tabId: number };

/** 注入脚本回传的执行结果。 */
export interface InspectedWindowScriptResultPayload {
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

const REQUIRED_ENVELOPE_KEYS = ['source', 'direction', 'type', 'payload', 'timestamp', 'sequence'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const isNonNegativeSafeInteger = (value: unknown): boolean => Number.isSafeInteger(value) && (value as number) >= 0;

const isPositiveSafeInteger = (value: unknown): boolean => Number.isSafeInteger(value) && (value as number) > 0;

/**
 * envelope 的键必须**精确**匹配（`tabId` 是唯一的可选键）。
 *
 * 与核心库 `hasExactKeys` 的语义一致：多一个键就拒绝。
 * 这不是洁癖 —— 消息来自页面上下文，夹带键是最省事的注入手段。
 */
function hasExactEnvelopeKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  if (keys.length > REQUIRED_ENVELOPE_KEYS.length + 1) return false;
  for (const key of REQUIRED_ENVELOPE_KEYS) {
    if (!Object.hasOwn(value, key)) return false;
  }
  return keys.every(key => key === 'tabId' || (REQUIRED_ENVELOPE_KEYS as readonly string[]).includes(key));
}

function hasValidEnvelope(value: Record<string, unknown>): boolean {
  if (!hasExactEnvelopeKeys(value)) return false;
  if (value['source'] !== RXDB_DEVTOOLS_MESSAGE) return false;
  if (value['direction'] !== 'page-to-devtools' && value['direction'] !== 'devtools-to-page') return false;
  if (!isNonNegativeSafeInteger(value['timestamp']) || !isNonNegativeSafeInteger(value['sequence'])) return false;
  if (Object.hasOwn(value, 'tabId') && !isPositiveSafeInteger(value['tabId'])) return false;
  return true;
}

function isScriptResultPayload(value: unknown): value is InspectedWindowScriptResultPayload {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value['requestId']) || typeof value['success'] !== 'boolean') return false;
  if (Object.hasOwn(value, 'error') && typeof value['error'] !== 'string') return false;
  return true;
}

/** 扩展自有类型的严校验：envelope + direction↔type 配对 + payload 形状，标准与核心库一致。 */
function isExtensionOnlyMessage(data: unknown): data is DevToolsMessage {
  if (!isRecord(data) || !hasValidEnvelope(data)) return false;

  const direction = data['direction'];
  const payload = data['payload'];
  switch (data['type']) {
    case 'INIT':
      // 面板 → 页面侧的握手。tabId 是它存在的全部理由，必须有。
      return direction === 'devtools-to-page' && payload === null && isPositiveSafeInteger(data['tabId']);
    case 'BRANCH_SWITCHED':
    case 'BRANCH_CREATED':
    case 'BRANCH_DELETED':
      return direction === 'page-to-devtools' && payload === null;
    case 'INSPECTED_WINDOW_SCRIPT_RESULT':
      return direction === 'page-to-devtools' && isScriptResultPayload(payload);
    case 'ERROR':
      return direction === 'page-to-devtools' && isRecord(payload) && isNonEmptyString(payload['message']);
    default:
      return false;
  }
}

/**
 * 严格校验一条扩展消息。
 *
 * @remarks
 * P0-1：这里原先是一份**自建的同名松校验**，只看 envelope
 * （source / direction 在集合内 / type 在白名单内 / 有 payload 键 / timestamp、sequence 是整数），
 * **不校验 payload 形状，也不校验 direction↔type 配对** ——
 * 而核心库 `@aiao/rxdb-devtools` 导出的同名函数本来就三样都查。
 *
 * 同名遮蔽的结果是：核心库那份严校验在整个扩展里**一次都没被调用过**，
 * 下游全是 `message.payload as { message: string }` 这样的盲转。
 *
 * 现在改为**组合**而非重写：核心类型交给核心库的严校验（它是唯一事实源，
 * 协议改了会同步生效），扩展自有类型按同样标准校验。
 */
export function isDevToolsMessage(data: unknown): data is DevToolsMessage {
  return isCoreDevToolsMessage(data) || isExtensionOnlyMessage(data);
}
