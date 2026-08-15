/**
 * @fileoverview session 身份与 ID 预算：在途上限、有界墓碑、15 秒请求时限。
 *
 * @remarks
 * 「终态 ID 不复用」是协议的硬要求：迟到的 RESPONSE 若能绑到一条同名的新请求上，两条互不
 * 相干的调用就会串线。实现方式只能是记住已终结的 ID——也就是墓碑。
 *
 * **墓碑必须有界，且满了之后不驱逐。** 无界集合让长 session 的内存随请求数单调增长，而这条
 * 增长在功能测试里完全看不见；驱逐则更糟：被驱逐的 ID 重新可用，正好废掉墓碑存在的理由，
 * 而且失效窗口恰好落在最繁忙的 session 上。所以耗尽时回终态的 `session_budget_exhausted`，
 * 由对端重新握手换一个新 session——这是唯一诚实的出路。
 *
 * 因此本模块有两类拒绝，语义必须分清：`request_limit_exceeded` / `transfer_limit_exceeded`
 * 是**可等待**的（结算任意一条在途即可让出名额），`session_budget_exhausted` 是**终态**。
 *
 * @module @aiao/rxdb-devtools/v2/session
 */

import type { DevToolsCancelTimer, DevToolsClock } from './clock.js';
import {
  DEVTOOLS_MAX_INFLIGHT_REQUESTS,
  DEVTOOLS_MAX_INFLIGHT_TRANSFERS,
  DEVTOOLS_MAX_REQUEST_TOMBSTONES,
  DEVTOOLS_MAX_TRANSFER_TOMBSTONES,
  DEVTOOLS_REQUEST_TIMEOUT_MS
} from './constants.js';
import { createDevToolsError } from './errors.js';
import type { DevToolsControlPlaneErrorCode, DevToolsErrorPayload } from './errors.js';
import { isDevToolsIdentifier } from './ids.js';

/** 构造一个 session 所需的外部依赖。 */
export interface DevToolsSessionPorts {
  /** 本 session 的身份，由协商阶段铸造。 */
  readonly sessionId: string;
  /** 时间端口；请求时限走它，不走宿主计时器。 */
  readonly clock: DevToolsClock;
  /**
   * 请求到期回调。
   *
   * @remarks
   * 触发时名额与墓碑都已处理完毕，回调只负责对外发 `request_timeout`。
   */
  readonly onRequestTimeout: (requestId: string) => void;
}

/** 一次 ID 登记的结果。 */
export type DevToolsRegistration =
  | { readonly outcome: 'registered' }
  | { readonly outcome: 'rejected'; readonly error: DevToolsErrorPayload };

/** session 的生命周期状态。 */
export type DevToolsSessionState = 'open' | 'closed';

/** session 对外的资源账本。 */
export interface DevToolsSession {
  /** 生命周期状态。 */
  readonly state: DevToolsSessionState;
  /** 本 session 的身份。 */
  readonly sessionId: string;
  /** 当前在途请求数。 */
  readonly inflightRequests: number;
  /** 当前在途传输数。 */
  readonly inflightTransfers: number;
  /** 已登记的请求墓碑数。 */
  readonly requestTombstones: number;
  /** 已登记的传输墓碑数。 */
  readonly transferTombstones: number;

  /**
   * 判断一条消息声称的 session 是否属于本 session。
   *
   * @param sessionId - wire 上读到的值，可能是任意类型。
   * @returns 仅当 session 仍开放且身份完全一致时为 `true`。
   */
  accepts(sessionId: unknown): boolean;

  /**
   * 登记一条在途请求并为它武装 15 秒时限。
   *
   * @param requestId - wire 上读到的值，可能是任意类型。
   * @returns 登记成功，或带控制面错误码的拒绝。
   */
  registerRequest(requestId: unknown): DevToolsRegistration;

  /**
   * 结算一条在途请求：取消时限、释放名额、登记墓碑。
   *
   * @param requestId - 请求标识符。
   * @returns 本次调用确实完成了结算时为 `true`；未知或已终结的 ID 为 `false`。
   */
  settleRequest(requestId: string): boolean;

  /**
   * 登记一条在途传输。
   *
   * @remarks
   * 传输**不**受 15 秒请求时限约束，它有自己的 idle 与总时长两道闸
   * （见 `v2/transfer.ts`）；在 1 GiB 上限下套用端到端 15 秒必然误杀。
   *
   * @param transferId - wire 上读到的值，可能是任意类型。
   * @returns 登记成功，或带控制面错误码的拒绝。
   */
  registerTransfer(transferId: unknown): DevToolsRegistration;

  /**
   * 结算一条在途传输：释放名额、登记墓碑。
   *
   * @param transferId - 传输标识符。
   * @returns 本次调用确实完成了结算时为 `true`。
   */
  settleTransfer(transferId: string): boolean;

  /**
   * 关闭 session：取消全部时限、清空在途账本。
   *
   * @remarks
   * 幂等。关闭后不再触发任何 `onRequestTimeout`——对端此时已经知道结果，迟到的超时回调
   * 只会让上层发出一条无主的 ERROR 帧。
   */
  close(): void;
}

/** 一类 ID 的预算账本；request 与 transfer 各持一份，互不挪用。 */
interface IdBudget {
  readonly inflight: Map<string, DevToolsCancelTimer | null>;
  readonly tombstones: Set<string>;
  readonly maxInflight: number;
  readonly maxTombstones: number;
  readonly duplicateCode: DevToolsControlPlaneErrorCode;
  readonly limitCode: DevToolsControlPlaneErrorCode;
}

/** 准入结果；`admitted` 顺带把已窄化的标识符带出来，避免调用点重复校验。 */
type Admission =
  | { readonly outcome: 'admitted'; readonly id: string }
  | { readonly outcome: 'rejected'; readonly error: DevToolsErrorPayload };

function createBudget(
  maxInflight: number,
  maxTombstones: number,
  duplicateCode: DevToolsControlPlaneErrorCode,
  limitCode: DevToolsControlPlaneErrorCode
): IdBudget {
  return { inflight: new Map(), tombstones: new Set(), maxInflight, maxTombstones, duplicateCode, limitCode };
}

function rejected(code: DevToolsControlPlaneErrorCode, retryable = false): Admission {
  return { outcome: 'rejected', error: createDevToolsError(code, { retryable }) };
}

class DevToolsSessionImpl implements DevToolsSession {
  readonly #ports: DevToolsSessionPorts;
  readonly #requests = createBudget(
    DEVTOOLS_MAX_INFLIGHT_REQUESTS,
    DEVTOOLS_MAX_REQUEST_TOMBSTONES,
    'request_duplicate',
    'request_limit_exceeded'
  );
  readonly #transfers = createBudget(
    DEVTOOLS_MAX_INFLIGHT_TRANSFERS,
    DEVTOOLS_MAX_TRANSFER_TOMBSTONES,
    'transfer_duplicate',
    'transfer_limit_exceeded'
  );
  #state: DevToolsSessionState = 'open';

  get state(): DevToolsSessionState {
    return this.#state;
  }

  get sessionId(): string {
    return this.#ports.sessionId;
  }

  get inflightRequests(): number {
    return this.#requests.inflight.size;
  }

  get inflightTransfers(): number {
    return this.#transfers.inflight.size;
  }

  get requestTombstones(): number {
    return this.#requests.tombstones.size;
  }

  get transferTombstones(): number {
    return this.#transfers.tombstones.size;
  }

  constructor(ports: DevToolsSessionPorts) {
    this.#ports = ports;
  }

  accepts(sessionId: unknown): boolean {
    return this.#state === 'open' && sessionId === this.#ports.sessionId;
  }

  registerRequest(requestId: unknown): DevToolsRegistration {
    const admission = this.#admit(this.#requests, requestId);
    if (admission.outcome === 'rejected') return admission;

    const id = admission.id;
    this.#requests.inflight.set(id, this.#ports.clock.setTimeout(() => this.#expire(id), DEVTOOLS_REQUEST_TIMEOUT_MS));
    return { outcome: 'registered' };
  }

  settleRequest(requestId: string): boolean {
    return this.#settle(this.#requests, requestId);
  }

  registerTransfer(transferId: unknown): DevToolsRegistration {
    const admission = this.#admit(this.#transfers, transferId);
    if (admission.outcome === 'rejected') return admission;

    this.#transfers.inflight.set(admission.id, null);
    return { outcome: 'registered' };
  }

  settleTransfer(transferId: string): boolean {
    return this.#settle(this.#transfers, transferId);
  }

  close(): void {
    if (this.#state === 'closed') return;
    this.#state = 'closed';
    for (const budget of [this.#requests, this.#transfers]) {
      for (const cancel of budget.inflight.values()) cancel?.();
      budget.inflight.clear();
    }
  }

  /**
   * 准入检查。
   *
   * @remarks
   * 顺序是承重的：`session_closed` 排在标识符校验之前，关闭后连「这个 ID 长得对不对」都不
   * 泄漏；终态的预算耗尽排在可等待的在途上限之前，免得对端白白排空在途才拿到同一个终态答案。
   */
  #admit(budget: IdBudget, value: unknown): Admission {
    if (this.#state === 'closed') return rejected('session_closed');
    if (!isDevToolsIdentifier(value)) return rejected('invalid_identifier');
    if (budget.inflight.has(value) || budget.tombstones.has(value)) return rejected(budget.duplicateCode);
    if (budget.tombstones.size >= budget.maxTombstones) return rejected('session_budget_exhausted');
    if (budget.inflight.size >= budget.maxInflight) return rejected(budget.limitCode, true);
    return { outcome: 'admitted', id: value };
  }

  #settle(budget: IdBudget, id: string): boolean {
    if (this.#state === 'closed' || !budget.inflight.has(id)) return false;

    budget.inflight.get(id)?.();
    budget.inflight.delete(id);
    budget.tombstones.add(id);
    return true;
  }

  #expire(requestId: string): void {
    if (!this.#requests.inflight.delete(requestId)) return;

    this.#requests.tombstones.add(requestId);
    this.#ports.onRequestTimeout(requestId);
  }
}

/**
 * 创建一个 session 资源账本。
 *
 * @param ports - session 身份、时钟与超时回调。
 * @returns 一个 {@link DevToolsSession}。
 */
export function createDevToolsSession(ports: DevToolsSessionPorts): DevToolsSession {
  return new DevToolsSessionImpl(ports);
}
