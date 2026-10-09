/**
 * rxdb-model 跨框架对拍 e2e 共享模块的类型契约（与 `entity-model-parity.mjs` 同步维护）。
 *
 * 三个 e2e 项目的 tsconfig `rootDir` 都是自己的项目目录，跨项目 import .ts 源码会触发
 * TS6059 / TS6307；以本声明文件 + 同名 .mjs 实现成对放置，tsc 只把这里当纯类型输入，
 * 运行期由 Playwright / Node 加载 .mjs。
 *
 * @module e2e-parity
 */

/** 归一化前、由三端 spec 采集的列表原始输出。 */
export interface ParityListRaw {
  /** 表头字段名（按列序）；系列号列等无名列为 `null`。 */
  columns: Array<string | null>;
  /** 行内容（按表格渲染序）；键为列字段名（不含系列号与 actions 列）。 */
  rows: Array<Record<string, unknown>>;
}

/** 归一化前、由三端 spec 采集的表单字段原始输出。 */
export interface ParityFormFieldRaw {
  /** 字段显示名（fieldset legend 文本）。 */
  label: string;
  /** create / edit 模式的控件类型（textbox / checkbox / select / textarea / …）；view 模式缺省。 */
  kind?: string;
  /** create / edit：控件当前值；view：展示文本。 */
  value: unknown;
}

/** 归一化前、由三端 spec 采集的详情对话框原始输出。 */
export interface ParityDetailRaw {
  /** Tab 文本列表。 */
  tabs: string[];
  /** 表单字段（DOM 渲染序）。 */
  form: ParityFormFieldRaw[];
}

/** 归一化前、由三端 spec 采集的查询构建器条件树原始输出。 */
export interface ParityFilterRaw {
  /** 根分组组合关系。 */
  combinator: 'and' | 'or';
  /** 规则列表（字段显示名 / 操作符标签 / 输入值）。 */
  rules: Array<{ field: string; operator: string; value: string }>;
}

/** 归一化前、由三端 spec 采集的整份原始快照。 */
export interface ParityRawSnapshot {
  /** 被对拍的实体（`namespace:name`）。 */
  entity: string;
  /** 种子数据下按标题升序的列表。 */
  list: ParityListRaw;
  /** view 模式详情（Tab + 只读表单）。 */
  detail: ParityDetailRaw;
  /** create 模式表单字段。 */
  createForm: ParityFormFieldRaw[];
  /** 筛选弹层里的条件树。 */
  filter: ParityFilterRaw;
  /** 筛选计数徽标原文（如「1 条记录」）。 */
  filterCountText: string;
  /** 应用筛选后的列表。 */
  filteredList: ParityListRaw;
}

/** 归一化后的语义列表快照。 */
export interface ParityListSnapshot {
  columns: Array<string | null>;
  rows: Array<Record<string, string | boolean | number>>;
}

/** 归一化后的语义表单字段。 */
export interface ParityFormFieldSnapshot {
  label: string;
  kind?: string;
  value: unknown;
}

/** 归一化后的语义条件树。 */
export interface ParityFilterSnapshot {
  combinator: 'and' | 'or';
  rules: Array<{ field: string; operator: string; value: string }>;
}

/** 归一化后的整份语义快照（与 golden 同构）。 */
export interface ParitySnapshot {
  format: 'aiao-rxdb-e2e-entity-model-parity';
  version: number;
  entity: string;
  list: ParityListSnapshot;
  detail: { tabs: string[]; form: ParityFormFieldSnapshot[] };
  createForm: ParityFormFieldSnapshot[];
  filter: ParityFilterSnapshot;
  filteredCount: number;
  filteredList: ParityListSnapshot;
}

/**
 * 归一化整份对拍原始快照：保留行内容 / 字段值 / 顺序 / 条件树，
 * 把 UUID 与时间等易失值替换为占位符（`<uuid>` / `<date>`），结构缺失直接抛错。
 */
export declare function normalizeParitySnapshot(raw: ParityRawSnapshot): ParitySnapshot;

/**
 * 读取 checked-in 的 golden 语义快照（`entity-model-parity.golden.json`）。
 *
 * @param specFile - 调用方 spec 的绝对路径（Playwright `testInfo.file`；golden 与本模块
 *   相对位置固定，由 spec 文件路径推导）
 */
export declare function loadParityGolden(specFile: string): ParitySnapshot;
