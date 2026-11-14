/** 用户与后台共用的积分余额。 */
export interface CreditAccount {
  balance: number;
  reserved: number;
  available: number;
}

/** 不可修改的积分流水；生成消费的请求标识就是任务标识。 */
export interface CreditEntry {
  id: number;
  user_id: string;
  actor_id: string;
  delta: number;
  balance_after: number;
  reason: string;
  source: 'admin' | 'generation';
  request_id: string;
  created_at: string;
}

/** 当前余额及按时间倒序的流水页。 */
export interface CreditSnapshot {
  account: CreditAccount;
  entries: CreditEntry[];
}
