/**
 * @fileoverview BOM 存储层 DDL 的方言工具（全部触发器生成器共用一份实现）
 *
 * 触发器 DDL 幂等且升级即替换：SQLite `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`；PG 函数
 * `CREATE OR REPLACE`，触发器在 DO 块里先删后建。表引用与实体分派从实体元数据派生，
 * 实体 / 表改名随元数据同步，DDL 文本里不手写表名与实体名。
 */

import {
  getEntityColumnName,
  getEntityMetadata,
  quoteSqlIdentifier,
  type EntityMetadata,
  type EntityType
} from '@aiao/rxdb';

/** SQLite 物理表名：`namespace$tableName`（与 sqlite-core 的表名约定一致）。 */
export const sqliteTableRef = (metadata: EntityMetadata): string =>
  quoteSqlIdentifier(`${metadata.namespace}$${metadata.tableName}`);

/** PG 表引用：`"schema"."table"`。 */
export const pgTableRef = (metadata: EntityMetadata): string =>
  `${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(metadata.tableName)}`;

/** 实体的 SQLite 表引用（跨表谓词引用其他 BOM 表）。 */
export const sqliteTableOf = (Entity: EntityType): string => sqliteTableRef(getEntityMetadata(Entity));

/** 实体的 PG 表引用（跨表谓词引用其他 BOM 表）。 */
export const pgTableOf = (Entity: EntityType): string => pgTableRef(getEntityMetadata(Entity));

/**
 * 元数据是否属于给定实体之一。
 *
 * @param metadata - 待判定的实体元数据（生成器的入参）
 * @param Entities - 候选实体类；命名空间与实体名取自其元数据，不手写实体名字符串
 */
export const isEntity = (metadata: EntityMetadata, ...Entities: EntityType[]): boolean =>
  Entities.some(Entity => {
    const target = getEntityMetadata(Entity);
    return metadata.namespace === target.namespace && metadata.name === target.name;
  });

/** 字段的带引号列名。 */
export const column = (metadata: EntityMetadata, field: string): string =>
  quoteSqlIdentifier(getEntityColumnName(metadata, field) as string);

/**
 * SQLite 先删后建的触发器语句对：插件升级后旧版本的同名触发器体被替换，不与新体并存
 * （`IF NOT EXISTS` 会让旧体静默保留）。已装定义一致时重连跳过；升级、缺失或创建序漂移时整批先删后建，
 * 同表同事件的执行序（SQLite 逆创建序）在新库与重连库上一致。
 *
 * @param tableRef - 触发器所在表的引用
 * @param name - 触发器名
 * @param timing - 时机与事件（如 `BEFORE UPDATE OF "state"`）
 * @param body - 触发体（一条或多条以分号结尾的语句）
 * @param when - 可选的 `WHEN` 条件
 * @returns `DROP` 与 `CREATE` 两条语句
 */
export const sqliteTrigger = (
  tableRef: string,
  name: string,
  timing: string,
  body: string,
  when?: string
): string[] => [
  `DROP TRIGGER IF EXISTS ${quoteSqlIdentifier(name)};`,
  [
    `CREATE TRIGGER ${quoteSqlIdentifier(name)}`,
    `${timing} ON ${tableRef}`,
    ...(when ? [`WHEN ${when}`] : []),
    `BEGIN`,
    body,
    `END;`
  ].join('\n')
];

/**
 * PG 触发器函数（`CREATE OR REPLACE` 幂等替换）。放行统一按 TG_OP 返回：BEFORE DELETE 返回 NEW
 * 会把删除吞掉（PG 语义：DELETE 时 NEW 为空，返回空即取消该行操作），DELETE 放行 RETURN OLD，
 * 其余 RETURN NEW——函数日后挂上 DELETE 事件也不会静默吞删除。
 *
 * @param metadata - 取命名空间（函数与表同 schema）
 * @param name - 函数名
 * @param body - 校验体（plpgsql 语句，违约即 RAISE；可在体内提前 RETURN）
 * @param declare - 可选的 `DECLARE` 段变量声明
 */
export const pgTriggerFunction = (metadata: EntityMetadata, name: string, body: string, declare?: string): string =>
  `CREATE OR REPLACE FUNCTION ${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(name)}() RETURNS trigger AS $$\n` +
  `${declare === undefined ? '' : `DECLARE ${declare}\n`}BEGIN\n${body}\n` +
  `  IF TG_OP = 'DELETE' THEN\n    RETURN OLD;\n  END IF;\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;`;

/**
 * PG 触发器创建语句：包进 `DO $$` 块——PGlite 0.5.8 的扩展协议解析不了裸 `CREATE TRIGGER`，
 * 仓库既有先例（notify 触发器）正是 DO 块形态，DROP IF EXISTS 一并收进块内。
 * `EXECUTE FUNCTION` 的目标**不得加引号**（探针：`"bom"."t__guard"` 让解析器报 `at end of input`）；
 * schema 与函数名都由本插件生成、落在安全标识符集内，裸写安全。
 *
 * @param metadata - 取函数所在的命名空间
 * @param tableRef - 触发器所在表的引用
 * @param name - 触发器名
 * @param events - 时机与事件（如 `BEFORE INSERT OR UPDATE`）
 * @param functionName - 触发器函数名（同命名空间）
 */
export const pgCreateTrigger = (
  metadata: EntityMetadata,
  tableRef: string,
  name: string,
  events: string,
  functionName: string
): string =>
  `DO $$\nBEGIN\n  DROP TRIGGER IF EXISTS ${quoteSqlIdentifier(name)} ON ${tableRef};\n  CREATE TRIGGER ${quoteSqlIdentifier(name)} ${events} ON ${tableRef} FOR EACH ROW EXECUTE FUNCTION ${metadata.namespace}.${functionName}();\nEND $$;`;
