import { useSyncExternalStore } from 'react';
import { getDbConnectionError, subscribeDbConnectionError } from '../rxdb/db-connection';

/** 最近一次本地数据库连接失败的错误信息；没有失败时为 `null`（US-221）。 */
export const useDbConnectionError = (): string | null =>
  useSyncExternalStore(subscribeDbConnectionError, getDbConnectionError);
