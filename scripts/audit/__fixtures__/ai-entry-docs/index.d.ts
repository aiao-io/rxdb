declare class RxDB {
  /** 普通插件在 init() 后立即安装；贡献仓储的插件与系统贡献必须在首次 connect() / init() 前 use()。 */
  use(plugin: unknown): this;
  /** 首次 connect() 同步调用 init()；必须先 use() 插件再连接。 */
  connect(name: string): Promise<unknown>;
}
declare class RxDBAdapterLocalBase {
  /**
   * @example
   * ✅ await adapter.transaction(async executor => { await executor.getRepository(Note).create(entity); });
   * ❌ await adapter.transaction(async () => { await entity.save(); }); 会重新排队，等待自己。
   */
  transaction<T>(fun: (executor: unknown) => Promise<T>): Promise<T>;
  /**
   * @example
   * ✅ await adapter.transaction(async executor => { await executor.getRepository(Note).create(entity); });
   * ❌ await adapter.transaction(async () => { await entity.save(); }); 会重新排队，等待自己。
   */
  transaction(fun: (executor: unknown) => Promise<unknown>): Promise<unknown>;
}
interface TransactionExecutor {
  /** 事务内使用 executor.getRepository；参见 RxDBAdapterLocalBase.transaction，entity.save() 会重新排队。 */
  getRepository(type: unknown): unknown;
}
declare class EntityBase {
  /** 事务内使用 TransactionExecutor.getRepository，参见 RxDBAdapterLocalBase.transaction。 */
  save: () => Promise<this>;
}
