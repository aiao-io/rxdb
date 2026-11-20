import { generationLeaseKey, generationResultKey, type PgmqGenerationIdempotencyStore } from './pgmq-idempotency.ts';
import { parsePgmqGenerationMessage, type PgmqGenerationMessage } from './pgmq-message.ts';

/** PGMQ 消息读取结果的最小字段，避免把数据库驱动类型泄漏进业务层。 */
export interface PgmqGenerationQueueMessage {
  msgId: string;
  readCount: number;
  message: unknown;
}

/** 隔离 PoC 所需的队列操作；实现层可由 Supabase RPC 或 node-postgres 提供。 */
export interface PgmqGenerationQueue {
  read(
    queue: string,
    visibilityTimeoutSeconds: number,
    quantity: number
  ): Promise<readonly PgmqGenerationQueueMessage[]>;
  delete(queue: string, messageId: string): Promise<void>;
  archive(queue: string, messageId: string): Promise<void>;
}

/** 供应商调用结果必须已经过业务层脱敏。 */
export interface PgmqGenerationProvider<TResult> {
  generate(message: PgmqGenerationMessage, idempotencyKey: string): Promise<TResult>;
}

export interface PgmqGenerationConsumerOptions<TResult> {
  queue: PgmqGenerationQueue;
  store: PgmqGenerationIdempotencyStore<TResult>;
  provider: PgmqGenerationProvider<TResult>;
  queueName?: string;
  visibilityTimeoutSeconds?: number;
  maxReadCount?: number;
}

export type PgmqConsumeResult =
  | { state: 'idle' }
  | { state: 'duplicate'; messageId: string }
  | { state: 'processed'; messageId: string; resultKey: string }
  | { state: 'retried'; messageId: string; errorCode: string }
  | { state: 'archived'; messageId: string; errorCode: string };

/** PGMQ 生成任务 PoC 消费器；不接管 Durable Object 生产队列。 */
export class PgmqGenerationConsumer<TResult> {
  readonly #queue: PgmqGenerationQueue;
  readonly #store: PgmqGenerationIdempotencyStore<TResult>;
  readonly #provider: PgmqGenerationProvider<TResult>;
  readonly #queueName: string;
  readonly #visibilityTimeoutSeconds: number;
  readonly #maxReadCount: number;

  constructor(options: PgmqGenerationConsumerOptions<TResult>) {
    this.#queue = options.queue;
    this.#store = options.store;
    this.#provider = options.provider;
    this.#queueName = options.queueName ?? 'media_generation_poc';
    this.#visibilityTimeoutSeconds = options.visibilityTimeoutSeconds ?? 60;
    this.#maxReadCount = options.maxReadCount ?? 5;
  }

  async runOnce(): Promise<PgmqConsumeResult> {
    const [message] = await this.#queue.read(this.#queueName, this.#visibilityTimeoutSeconds, 1);
    if (!message) return { state: 'idle' };

    let task: PgmqGenerationMessage;
    try {
      task = parsePgmqGenerationMessage(message.message);
    } catch {
      await this.#archive(message);
      return { state: 'archived', messageId: message.msgId, errorCode: 'invalid_message' };
    }

    const leaseKey = generationLeaseKey(task);
    const resultKey = generationResultKey(task);
    if (!(await this.#store.acquireTaskLease(task, leaseKey))) {
      await this.#queue.delete(this.#queueName, message.msgId);
      return { state: 'duplicate', messageId: message.msgId };
    }

    try {
      const existing = await this.#store.findResult(resultKey);
      const result = existing ?? (await this.#provider.generate(task, resultKey));
      await this.#store.writeResult(resultKey, result);
      await this.#store.advanceTask(task, resultKey);
      await this.#store.settleCredits(resultKey);
      await this.#queue.delete(this.#queueName, message.msgId);
      return { state: 'processed', messageId: message.msgId, resultKey };
    } catch (error) {
      const errorCode = error instanceof Error && error.message ? error.message.slice(0, 120) : 'consumer_failure';
      await this.#store.recordFailure(task, errorCode);
      if (message.readCount >= this.#maxReadCount) {
        await this.#queue.archive(this.#queueName, message.msgId);
        return { state: 'archived', messageId: message.msgId, errorCode };
      }
      return { state: 'retried', messageId: message.msgId, errorCode };
    }
  }

  async #archive(message: PgmqGenerationQueueMessage): Promise<void> {
    await this.#queue.archive(this.#queueName, message.msgId);
  }
}
