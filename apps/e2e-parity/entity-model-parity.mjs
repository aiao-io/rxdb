/**
 * rxdb-model 跨框架对拍 e2e 的共享语义归一化实现（T049）。
 *
 * 三个 e2e 项目（dev-rxdb-angular-e2e / dev-rxdb-react-e2e / dev-rxdb-vue-e2e）
 * 各跑一份 `entity-model-parity.spec.ts`（场景与交互步骤一致），在**同一份 Todo
 * 种子数据**下采集列表 / 详情 / 表单 / 查询构建器的原始输出，交给本模块归一化成
 * **语义级**结构化快照，再与同一份 checked-in 的 golden（`entity-model-parity.golden.json`）
 * 比较。三端都过同一 golden，即三端两两一致。
 *
 * 为什么要归一化而不是比原始 DOM：
 * - Angular 有 _ngcontent 等私有属性、三端 DOM 结构本就不同，原始 HTML 无法对齐；
 * - VTable 画在 canvas 上，行内容只能从 `__vtable__` 的记录与列定义读取；
 * - 记录 id 是每次运行新生成的 UUID、创建/更新时间随运行变化，属**易失值**，
 *   在语义层统一替换为占位符，列 / 字段的存在性与顺序仍被 golden 锁定。
 *
 * 三端 spec 里只保留「怎么读页面」（采集），「读出来之后怎么归一化」全部在这里 ——
 * 归一化是单一实现，不随框架复制。类型契约见同目录 `entity-model-parity.d.mts`。
 *
 * 本目录刻意不注册为 Nx 项目：e2e 的 tsconfig `rootDir` 是自己的项目目录，
 * 跨项目 import .ts 源码会触发 TS6059 / TS6307；以 `.mjs`（实现）+ `.d.mts`
 * （声明，被 tsc 视为纯类型输入）成对放置即可通过三端 typecheck 与 lint，
 * 运行期由 Playwright / Node 直接加载 .mjs。
 *
 * @module e2e-parity
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** golden 快照文件名（与本模块同目录）。 */
const GOLDEN_FILE = 'entity-model-parity.golden.json';
/** 快照格式标识：改结构时必须一起改 version 与 golden。 */
const SNAPSHOT_FORMAT = 'aiao-rxdb-e2e-entity-model-parity';
const SNAPSHOT_VERSION = 1;

/** 表格里 UUID 主键列的语义占位符。 */
const UUID_MARKER = '<uuid>';
/** 表格里时间列的语义占位符。 */
const DATE_MARKER = '<date>';
/** VTable 行系列号列的内部字段名（不是实体字段），语义快照中记作匿名列（`null`）。 */
const VTABLE_SERIES_FIELD = '_vtable_rowSeries_number';

/** 行级易失字段：键为列字段名，值为语义占位符。 */
const VOLATILE_ROW_FIELDS = new Map([
  ['id', UUID_MARKER],
  ['createdAt', DATE_MARKER],
  ['updatedAt', DATE_MARKER]
]);

/** 表单字段级易失值：键为字段显示名（legend 文本），值为语义占位符。 */
const VOLATILE_FORM_LABELS = new Map([
  ['ID', UUID_MARKER],
  ['创建时间', DATE_MARKER],
  ['更新时间', DATE_MARKER]
]);

/** 快照允许的原始单元格值类型（归一化后也只有这些类型）。 */
const isScalarValue = value => typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number';

/**
 * 归一化单个单元格值：易失字段换成占位符，其余必须是标量。
 *
 * @param field - 列字段名
 * @param value - 记录里的原始值
 * @returns 语义值（标量或占位符）
 * @throws 单元格值缺字段或类型超出契约时（缺数据是测试前提被破坏，直接失败）
 */
function normalizeRowValue(field, value) {
  const marker = VOLATILE_ROW_FIELDS.get(field);
  if (marker !== undefined) return marker;
  if (!isScalarValue(value)) {
    throw new Error(`对拍行值超出语义契约：字段 ${JSON.stringify(field)} = ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * 归一化列表原始输出：列布局 + 行内容（行序保持表格渲染序）。
 *
 * @param raw - spec 从 VTable 读出的原始结构
 * @returns 语义列表快照
 */
function normalizeList(raw) {
  if (!Array.isArray(raw.columns) || raw.columns.length === 0) {
    throw new Error('对拍列表缺少列定义');
  }
  if (!Array.isArray(raw.rows) || raw.rows.length === 0) {
    throw new Error('对拍列表没有任何行：要么采集失败，要么种子数据没落库');
  }
  const columns = raw.columns.map(field => {
    if (field === null || field === undefined || field === '') return null;
    if (typeof field !== 'string') {
      throw new Error(`对拍列字段名超出语义契约：${JSON.stringify(field)}`);
    }
    // VTable 行系列号列是引擎内部列，三端一致，但在语义层是匿名列
    return field === VTABLE_SERIES_FIELD ? null : field;
  });
  const rows = raw.rows.map(record => {
    const row = {};
    for (const field of columns) {
      if (field === null || field === 'actions') continue;
      row[field] = normalizeRowValue(field, record[field]);
    }
    return row;
  });
  return { columns, rows };
}

/**
 * 归一化表单字段值：view 模式的易失显示值换成占位符。
 *
 * @param label - 字段显示名（legend 文本）
 * @param value - 控件当前值（create/edit）或展示文本（view）
 * @returns 语义值
 */
function normalizeFormValue(label, value) {
  const marker = VOLATILE_FORM_LABELS.get(label);
  if (marker !== undefined) return marker;
  return value;
}

/**
 * 归一化表单原始输出：字段顺序 = DOM 渲染顺序。
 *
 * @param raw - spec 从表单读出的原始字段列表
 * @returns 语义表单快照
 */
function normalizeForm(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('对拍表单没有任何字段：要么采集失败，要么元数据没有产出字段');
  }
  return raw.map(field => {
    const label = typeof field.label === 'string' ? field.label.trim() : '';
    if (!label) {
      throw new Error(`对拍表单字段缺显示名：${JSON.stringify(field)}`);
    }
    const normalized = { label, value: normalizeFormValue(label, field.value) };
    if (field.kind !== undefined) normalized.kind = field.kind;
    return normalized;
  });
}

/**
 * 归一化筛选计数徽标文本（「N 条记录」→ 整数）。
 *
 * @param text - 徽标全文
 * @returns 记录数
 * @throws 读不出数字时（与 e2e-utils.readCount 同哲学：读不到就失败，不伪装成 0）
 */
function normalizeFilterCount(text) {
  const matched = String(text).match(/\d+/)?.[0];
  if (matched === undefined) {
    throw new Error(`无法从筛选计数徽标读出计数：${JSON.stringify(text)}`);
  }
  return Number(matched);
}

/**
 * 归一化查询构建器条件树原始输出。
 *
 * @param raw - spec 从筛选弹层读出的组合关系与规则列表
 * @returns 语义条件树
 */
function normalizeFilter(raw) {
  if (raw.combinator !== 'and' && raw.combinator !== 'or') {
    throw new Error(`对拍条件树组合关系超出语义契约：${JSON.stringify(raw.combinator)}`);
  }
  if (!Array.isArray(raw.rules) || raw.rules.length === 0) {
    throw new Error('对拍条件树没有任何规则：要么采集失败，要么规则没加上');
  }
  return {
    combinator: raw.combinator,
    rules: raw.rules.map(rule => {
      const field = typeof rule.field === 'string' ? rule.field.trim() : '';
      const operator = typeof rule.operator === 'string' ? rule.operator.trim() : '';
      if (!field || !operator) {
        throw new Error(`对拍条件规则缺字段或操作符：${JSON.stringify(rule)}`);
      }
      return { field, operator, value: rule.value };
    })
  };
}

/**
 * 归一化详情 Tab 列表。
 *
 * @param tabs - spec 读出的 tab 文本
 * @returns 语义 tab 列表
 * @throws 没有 tab 时（详情对话框没打开或采集被破坏）
 */
function normalizeTabs(tabs) {
  if (!Array.isArray(tabs) || tabs.length === 0) {
    throw new Error('对拍详情缺 Tab 列表：详情对话框可能没有打开');
  }
  return tabs.map(tab => (typeof tab === 'string' ? tab.trim() : ''));
}

/**
 * 归一化整份对拍原始快照。
 *
 * 原始快照由三端 spec 以相同步骤采集（列表、详情、表单字段、查询构建器条件树、
 * 应用筛选后的列表与计数），本函数把它收敛成语义快照：
 * - 行内容 / 字段值 / 行顺序 / 列顺序全部保留；
 * - UUID 与时间等易失值替换为占位符；
 * - 结构缺失直接抛错（缺数据 = 采集被破坏，不让空结构悄悄比出假绿）。
 *
 * @param raw - 三端 spec 采集的原始快照
 * @returns 与 golden 同构的语义快照
 */
export function normalizeParitySnapshot(raw) {
  if (typeof raw.entity !== 'string' || !raw.entity) {
    throw new Error(`对拍快照缺实体标识：${JSON.stringify(raw.entity)}`);
  }
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    entity: raw.entity,
    list: normalizeList(raw.list),
    detail: {
      tabs: normalizeTabs(raw.detail.tabs),
      form: normalizeForm(raw.detail.form)
    },
    createForm: normalizeForm(raw.createForm),
    filter: normalizeFilter(raw.filter),
    filteredCount: normalizeFilterCount(raw.filterCountText),
    filteredList: normalizeList(raw.filteredList)
  };
}

/**
 * 读取 checked-in 的 golden 语义快照。
 *
 * @remarks 不能用 `import.meta.url` 定位本目录：e2e 项目没有 `"type": "module"`，
 * Playwright 会把 spec（及其依赖的本模块）按 CJS 转译加载，CJS 产物里 `import.meta` 直接报
 * "Cannot use 'import.meta' outside a module"。golden 与本模块的相对位置是固定的
 * （`apps/e2e-parity/` 位于三个 e2e 项目 `src/` 的上两级），由调用方传入 spec 文件路径定位。
 *
 * @param specFile - 调用方 spec 的绝对路径（Playwright `testInfo.file`）
 * @returns golden 快照（结构与 {@link normalizeParitySnapshot} 输出一致）
 * @throws golden 缺失或格式 / 版本不对时
 */
export function loadParityGolden(specFile) {
  const goldenPath = join(dirname(specFile), '../../e2e-parity', GOLDEN_FILE);
  const raw = JSON.parse(readFileSync(goldenPath, 'utf8'));
  if (raw.format !== SNAPSHOT_FORMAT || raw.version !== SNAPSHOT_VERSION) {
    throw new Error(`golden 快照格式不匹配：${JSON.stringify({ format: raw.format, version: raw.version })}`);
  }
  return raw;
}
