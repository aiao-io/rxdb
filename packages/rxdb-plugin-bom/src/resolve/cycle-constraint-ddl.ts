import { remoteReachDdl } from '../reach/remote.js';

/**
 * 生成远端 PostgreSQL 的BOM可达性、判环与增量维护部署DDL。
 *
 * @returns 原子回填和存储约束；拓扑写入在Read Committed下按类型/组织取事务锁
 * @remarks 整段作为一次SQL批次执行，保留调用方已有事务；不改变http/supabase显式不支持状态。
 */
export const cycleConstraintDdlForRemotePg = (): string => remoteReachDdl();
