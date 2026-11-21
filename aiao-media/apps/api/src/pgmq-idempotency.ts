import type { PgmqGenerationMessage } from './pgmq-message.ts';

/** PGMQ 消费与任务、结果、积分账本之间的幂等边界。 */
export interface PgmqGenerationIdempotencyStore<TResult = unknown> {
  /** 获取任务租约；重复消息或旧修订返回 false。 */
  acquireTaskLease(message: PgmqGenerationMessage, leaseKey: string): Promise<boolean>;
  /** 处理失败后释放任务租约，让 visibility timeout 后的消息可以重试。 */
  releaseTaskLease(message: PgmqGenerationMessage, leaseKey: string): Promise<void>;
  /** 按结果唯一键读取已写入结果，供 ack 前崩溃后的恢复使用。 */
  findResult(resultKey: string): Promise<TResult | null>;
  /** 只允许同一个结果唯一键成功写入一次。 */
  writeResult(resultKey: string, result: TResult): Promise<'created' | 'existing'>;
  /** 任务状态必须带 revision CAS；返回是否实际推进。 */
  advanceTask(message: PgmqGenerationMessage, resultKey: string): Promise<boolean>;
  /** 积分结算使用同一结果唯一键守卫，重复调用必须是幂等 no-op。 */
  settleCredits(resultKey: string): Promise<'settled' | 'existing' | 'skipped'>;
  /** 消费失败时记录诊断信息，不得携带 prompt、密钥或原图。 */
  recordFailure(message: PgmqGenerationMessage, errorCode: string): Promise<void>;
}

/** 任务修订级租约键，禁止把 prompt 或 provider secret 带入消息或幂等键。 */
export function generationLeaseKey(message: PgmqGenerationMessage): string {
  return `${message.taskId}:${message.taskRevision}`;
}

/** 结果唯一键；provider 重试、消费者重启和 ack 前崩溃共用这一键。 */
export function generationResultKey(message: PgmqGenerationMessage): string {
  return `media-generation:${message.taskId}:${message.taskRevision}`;
}
