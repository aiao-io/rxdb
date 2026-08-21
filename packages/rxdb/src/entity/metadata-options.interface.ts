/**
 * @fileoverview 实体元数据选项 — 公共 API barrel
 *
 * 历史上本文件聚合了实体装饰器配置所需的全部接口与类型。文件膨胀到 1442 行后按主题
 * 拆分到下列子文件，本文件仅保留对外的 re-export 以保持公共 API 完全兼容：
 *
 * - [property-types.interface.ts](./property-types.interface.ts) 字段类型、属性枚举、属性元数据联合类型、索引、外键约束
 * - [relation-types.interface.ts](./relation-types.interface.ts) 关系种类枚举、级联选项、关系元数据
 * - [cascade-options.interface.ts](./cascade-options.interface.ts) 字段业务语义（format 判别联合、FieldOptions、RxDBScalar）
 * - [entity-options.interface.ts](./entity-options.interface.ts) 实体级元数据（EntityMetadataOptions + features + tree）
 * - [sync-options.interface.ts](./sync-options.interface.ts) 同步策略（SyncType 枚举、SyncOptions 联合、QueryCacheEntityMetadata）
 *
 * @remarks
 * 拆分不引入任何运行时符号；`import { PropertyType } from './metadata-options.interface.js'`
 * 这类既有调用方无需改动。所有内部 `interface`（`IEntityObject` / `ISortable` /
 * `EntityRelationMetadataBase` 等）只在子文件内使用，**不会**通过本 barrel 暴露。
 */

export * from './cascade-options.interface.js';
export * from './entity-options.interface.js';
export * from './property-types.interface.js';
export * from './relation-types.interface.js';
export * from './sync-options.interface.js';

