import type { RxDB } from '@aiao/rxdb';

/** 生产构建保留统一生命周期接缝，不加载开发工具。 */
export function connectMediaDevTools(db: RxDB): () => void {
  void db;
  return () => undefined;
}
