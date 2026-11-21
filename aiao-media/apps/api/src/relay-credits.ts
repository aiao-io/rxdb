import { configuredEnvironment } from './configured-environment.ts';
import { backend } from './product-http.ts';
import type { WorkerEnv } from './worker-env.ts';

/** 预占只保存标识与摘要，不保存提示词、令牌或模型凭据。 */
export interface RelayCreditInput {
  taskId: string;
  ownerId: string;
  cost: number;
  fingerprint: string;
  tokenHash: string;
}
/** 任务可以预占、释放或完成一次扣减。 */
export type RelayCreditState = 'reserved' | 'released' | 'charged';
/** 持久任务通过同一账本预占与结清积分。 */
export interface RelayCredits {
  reserve(input: RelayCreditInput): Promise<RelayCreditState>;
  complete(taskId: string): Promise<RelayCreditState>;
  release(input: RelayCreditInput): Promise<RelayCreditState>;
}
/** 两种服务端运行时都访问产品 PostgreSQL 账本。 */
export class BackendRelayCredits implements RelayCredits {
  private readonly env: WorkerEnv;
  constructor(env: WorkerEnv) {
    this.env = env;
  }
  async reserve(input: RelayCreditInput) {
    return this.call('media_reserve_credits', this.parameters(input));
  }
  async complete(taskId: string) {
    return this.call('media_settle_credits', { p_task: taskId, p_received: true });
  }
  async release(input: RelayCreditInput) {
    return this.call('media_abort_credits', this.parameters(input));
  }
  private parameters(input: RelayCreditInput) {
    return {
      p_owner: input.ownerId,
      p_task: input.taskId,
      p_cost: input.cost,
      p_fingerprint: input.fingerprint,
      p_token_hash: input.tokenHash
    };
  }
  private async call(name: string, payload: object): Promise<RelayCreditState> {
    const client = backend(await configuredEnvironment(this.env));
    const receipt = await client.call<{ state: RelayCreditState }>(`/rest/v1/rpc/${name}`, { method: 'POST', payload });
    if (!['reserved', 'released', 'charged'].includes(receipt.state)) throw new Error('Invalid credit receipt');
    return receipt.state;
  }
}
