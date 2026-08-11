import { PGliteOptions } from '@electric-sql/pglite';

/**
 * PGlite 适配器名称常量
 */
export const ADAPTER_NAME = 'pglite' as const;

/**
 * PGlite 变更事件类型枚举
 * 对应 PostgreSQL 的 TG_OP (trigger operation)
 */
export enum PGliteChangeType {
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

/**
 * PGlite 通知 payload 结构
 * 从 NOTIFY 消息中解析的数据
 */
export interface PGliteNotifyPayload {
  /** 操作类型 */
  operation: PGliteChangeType;
  /** 表名 */
  table: string;
  /** 受影响的行 ID 数组 */
  ids: Array<string | number>;
}

/**
 * PGlite 变更事件
 * 触发器通过 NOTIFY 发送的数据库变更事件
 */
export interface PGliteChangeEvent {
  /** 事件类型 */
  type: PGliteChangeType;
  /** 数据库名称 */
  dbName: string;
  /** 表名称 */
  tableName: string;
  /** 受影响的行 ID 列表 */
  rowIds: Array<string | number>;
  /** 记录时间 */
  recordAt: Date;
}

/**
 * PGlite 客户端配置选项
 * 扩展自 PGlite 原生配置
 */
export interface PGliteClientOptions extends PGliteOptions {
  /**
   * 存储类型
   * - 'memory': 内存存储
   * - 'idb': IndexedDB 存储
   * 显式传入 dataDir 时，优先使用 dataDir
   */
  store?: 'memory' | 'idb';
}

/**
 * PGlite 数据库表列信息接口
 * 包含 PostgreSQL information_schema.columns 视图的所有字段
 */
export interface PgliteTableColumn {
  /** 数据库目录名称 */
  table_catalog: string;
  /** 数据库模式名称 */
  table_schema: string;
  /** 表名称 */
  table_name: string;
  /** 列名称 */
  column_name: string;
  /** 列在表中的顺序位置 */
  ordinal_position: number;
  /** 列的默认值 */
  column_default: unknown;
  /** 列是否可为 NULL */
  is_nullable: 'YES' | 'NO';
  /** 数据类型 */
  data_type: string;
  /** 字符类型的最大长度 */
  character_maximum_length?: number;
  /** 字符类型的字节长度 */
  character_octet_length?: number;
  /** 数值类型的精度 */
  numeric_precision?: number;
  /** 数值精度的基数 */
  numeric_precision_radix?: number;
  /** 数值类型的小数位数 */
  numeric_scale?: number;
  /** 日期时间类型的精度 */
  datetime_precision?: number;
  /** 间隔类型 */
  interval_type?: string;
  /** 间隔精度 */
  interval_precision?: number;
  /** 字符集目录 */
  character_set_catalog?: string;
  /** 字符集模式 */
  character_set_schema?: string;
  /** 字符集名称 */
  character_set_name?: string;
  /** 排序规则目录 */
  collation_catalog?: string;
  /** 排序规则模式 */
  collation_schema?: string;
  /** 排序规则名称 */
  collation_name?: string;
  /** 域目录 */
  domain_catalog?: string;
  /** 域模式 */
  domain_schema?: string;
  /** 域名称 */
  domain_name?: string;
  /** 用户定义类型目录 */
  udt_catalog: string;
  /** 用户定义类型模式 */
  udt_schema: string;
  /** 用户定义类型名称 */
  udt_name: string;
  /** 作用域目录 */
  scope_catalog?: string;
  /** 作用域模式 */
  scope_schema?: string;
  /** 作用域名称 */
  scope_name?: string;
  /** 最大基数 */
  maximum_cardinality?: number;
  /** 数据类型描述符标识符 */
  dtd_identifier: string;
  /** 是否自引用 */
  is_self_referencing: string;
  /** 是否为标识列 */
  is_identity: string;
  /** 标识列生成方式 */
  identity_generation?: string;
  /** 标识列起始值 */
  identity_start?: string;
  /** 标识列增量 */
  identity_increment?: string;
  /** 标识列最大值 */
  identity_maximum?: string;
  /** 标识列最小值 */
  identity_minimum?: string;
  /** 标识列是否循环 */
  identity_cycle: string;
  /** 是否为生成列 */
  is_generated: string;
  /** 生成列表达式 */
  generation_expression?: string;
  /** 是否可更新 */
  is_updatable: string;
  /** 约束类型 */
  constraint_type: string;
}

/**
 * 外键约束信息类型
 * 描述表之间的外键关系
 */
export type ForeignKey = {
  /** 约束目录名称 */
  constraint_catalog: string;
  /** 约束模式名称 */
  constraint_schema: string;
  /** 约束名称 */
  constraint_name: string;
  /** 表目录名称 */
  table_catalog: string;
  /** 表模式名称 */
  table_schema: string;
  /** 表名称 */
  table_name: string;
  /** 列名称 */
  column_name: string;
  /** 列在约束中的顺序位置 */
  ordinal_position: number;
  /** 在唯一约束中的位置 */
  position_in_unique_constraint?: number;
};
