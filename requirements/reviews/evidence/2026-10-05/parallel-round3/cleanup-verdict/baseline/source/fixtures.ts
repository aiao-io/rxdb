/**
 * 事务契约套件的共享夹具。
 *
 * @remarks
 * 实体在这里就地定义（与 `../encrypted/lifecycle.suite.ts` 的 `PlainEntity` 同一手法），
 * 避免套件依赖生成产物 `@aiao/rxdb-test/entities`——那批实体带关系与树结构，会把
 * 「建表 + 水位线」这条最小首装路径的失败面放大到无法归因。
 */
import type { MigrationType } from '@aiao/rxdb';
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/** 只有一个标量字段的最小实体，用于观察建表与首装。 */
@Entity({
  name: 'TransactionContractNote',
  tableName: 'transaction_contract_note',
  namespace: 'txcontract',
  log: false,
  properties: [{ name: 'label', type: PropertyType.string, required: true }]
})
export class TransactionContractNote extends EntityBase {
  label!: string;
}

/** 故意不加入建表清单；作为末尾初始数据时会让引导事务失败。 */
@Entity({
  name: 'TransactionContractFailure',
  tableName: 'transaction_contract_failure',
  namespace: 'txcontract',
  log: false,
  properties: [{ name: 'label', type: PropertyType.string, required: true }]
})
export class TransactionContractFailure extends EntityBase {
  label!: string;
}

/** 生成本次用例专属的空库名。首装路径只在 `RxDBMigration` 表不存在时才走。 */
export const freshDbName = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * 生成一组「不该被执行」的迁移。
 *
 * @remarks
 * 首装建出来的表已经是最新形态，配置里的迁移描述的都是通往该形态的中间步骤，
 * 对空库全部无意义 —— 但**水位线必须落库**，否则下次启动会把它们当成从未执行过。
 * 每个 `up` 都记账，套件据此断言「一次都没被调用」。
 */
export const createUnexecutedMigrations = (
  names: readonly string[]
): { migrations: MigrationType[]; executed: string[] } => {
  const executed: string[] = [];
  const migrations = names.map(name => ({
    name,
    up: async (): Promise<void> => {
      executed.push(name);
    },
    down: async (): Promise<void> => undefined
  }));
  return { migrations, executed };
};
