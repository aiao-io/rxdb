/**
 * @fileoverview 随机源：逻辑层有没有、Worker 里的能不能撑起 adapter 的随机池。
 *
 * 支付宝文档没有 `my.getRandomValues`，v2 探针两端实测逻辑层也没有 `crypto`；Worker 里有
 * `crypto.getRandomValues`。正式 host 的随机源经 Worker 取，这里按 adapter 默认池与 1 MiB 两个长度直接取一次。
 */
import { probe, type Probe, type Skipped } from '../probe.js';
import { summarizeRandom, type RandomSummary } from './environment.js';

/** adapter 默认池、1 MiB。 */
export const WORKER_RANDOM_LENGTHS = [65_536, 1_048_576] as const;

/** 成员名像随机源或密码学 API 的，都记下来，免得漏掉文档没写的入口。 */
const RANDOM_LIKE_NAME = /random|crypto|secur|uuid|cipher|rsa|hash|entropy/i;

/** 逻辑层的随机源线索。 */
export interface LogicRandomReport {
  readonly myGetRandomValues: string;
  /** 自由变量 `crypto` 的 `typeof`。 */
  readonly crypto: string;
  /** `my` 上（含原型链）名字像随机源的成员。 */
  readonly randomLikeMembers: Probe<readonly string[]>;
}

/** 随机源实验的结果。 */
export interface RandomReport {
  readonly logic: LogicRandomReport;
  /** 键为长度；Worker 没建起来或探测失败时整步跳过。 */
  readonly worker: Readonly<Record<string, Probe<RandomSummary>>> | Skipped;
}

function memberNames(target: object): string[] {
  const names = new Set<string>();
  for (
    let current: object | null = target;
    current && current !== Object.prototype;
    current = Object.getPrototypeOf(current)
  ) {
    for (const name of Object.getOwnPropertyNames(current)) names.add(name);
  }
  // 平台对象可能把 API 挂成不可枚举的访问器以外的形式，for-in 再补一遍
  for (const name in target) names.add(name);
  return [...names];
}

/**
 * 跑随机源实验。
 *
 * @param my - 支付宝全局 `my`
 * @param source - 正式 host 的 `requestRandomValues`；跳过时写明原因
 */
export async function runRandomExperiment(
  my: object,
  source: ((length: number) => Promise<Uint8Array>) | Skipped
): Promise<RandomReport> {
  const logic: LogicRandomReport = {
    myGetRandomValues: typeof Reflect.get(my, 'getRandomValues'),
    crypto: typeof crypto,
    randomLikeMembers: await probe(() =>
      memberNames(my)
        .filter(name => RANDOM_LIKE_NAME.test(name))
        .sort()
    )
  };
  if (typeof source !== 'function') return { logic, worker: source };
  const worker: Record<string, Probe<RandomSummary>> = {};
  for (const length of WORKER_RANDOM_LENGTHS) {
    worker[String(length)] = await probe(async () => summarizeRandom(await source(length)));
  }
  return { logic, worker };
}
