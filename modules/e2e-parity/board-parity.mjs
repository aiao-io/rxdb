/**
 * 看板跨框架对拍 e2e 的共享语义归一化实现（US-539 AC#1～3 的对拍半边）。
 *
 * 三个 e2e 项目（dev-rxdb-angular-e2e / dev-rxdb-react-e2e / dev-rxdb-vue-e2e）
 * 各跑一份 `board-parity.spec.ts`（场景与交互步骤一致）：装载 US-540 的同一份
 * 确定性种子，采集板 / 列 / 任务 / 标签的语义输出；执行同一组真实拖拽与同一组
 * 详情编辑后再采一次，交给本模块归一化成**语义级**结构化快照，与同一份
 * checked-in 的 golden（`board-parity.golden.json`）比较。
 * 三端都过同一 golden，即三端两两一致。
 *
 * 为什么是语义快照而不是比原始 DOM：
 * - Angular 有 _ngcontent 等私有属性、三端 DOM 结构不同，原始 HTML 无法对齐；
 * - 种子固定 id 与审计时间（US-540 AC#1），所以任务顺序、标题、截止日与标签
 *   可以直接进 golden；真正易失的只有 sortOrder 键，这里不采集它，顺序由数组
 *   次序表达；
 * - 标签颜色经 `getComputedStyle` 归一为 rgb() 串，避免三端 inline style 写法
 *   差异（hex / style 对象 / 绑定语法）混进快照。
 *
 * 三端 spec 里只保留「怎么读页面」（采集），「读出来之后怎么归一化」全部在这里 ——
 * 归一化是单一实现，不随框架复制。类型契约见同目录 `board-parity.d.mts`。
 *
 * 本目录是 Nx 项目 `e2e-parity`（只有 lint 与 `node --test` 单测，没有 tsconfig），
 * 三端 spec 以相对路径 import 本模块，与 entity-model-parity 同构（见其模块头注释）。
 *
 * @module e2e-parity
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** golden 快照文件名（与本模块同目录）。 */
const GOLDEN_FILE = 'board-parity.golden.json';
/** 快照格式标识：改结构时必须一起改 version 与 golden。 */
const SNAPSHOT_FORMAT = 'aiao-rxdb-e2e-board-parity';
const SNAPSHOT_VERSION = 1;

/**
 * 读取 checked-in 的 golden 语义快照。
 *
 * @remarks 不能用 `import.meta.url` 定位本目录：e2e 项目没有 `"type": "module"`，
 * Playwright 会把 spec（及其依赖的本模块）按 CJS 转译加载，CJS 产物里 `import.meta` 直接报
 * "Cannot use 'import.meta' outside a module"。golden 与三个 e2e 项目 `src/` 的相对位置是固定的
 * （`../../../modules/e2e-parity`），由调用方传入 spec 文件路径定位。
 *
 * @param specFile - 调用方 spec 的绝对路径（Playwright `testInfo.file`）
 * @returns golden 快照（结构与 {@link normalizeParitySnapshot} 输出一致）
 * @throws golden 缺失或格式 / 版本不对时
 */
export function loadParityGolden(specFile) {
  const goldenPath = join(dirname(specFile), '../../../modules/e2e-parity', GOLDEN_FILE);
  const raw = JSON.parse(readFileSync(goldenPath, 'utf8'));
  if (raw.format !== SNAPSHOT_FORMAT || raw.version !== SNAPSHOT_VERSION) {
    throw new Error(`golden 快照格式不匹配：${JSON.stringify({ format: raw.format, version: raw.version })}`);
  }
  return raw;
}

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 任务语义输出：标题 / 标签名（按名排序）/ 截止日（空串归一为 null）。
 * 标签列表与截止日字段缺失按采集漏项报错：三端采集恒给数组与 `string | null`，静默补成空值会让漏采的一端照样对上 golden。
 */
function normalizeTask(rawTask) {
  if (!isRecord(rawTask) || typeof rawTask.title !== 'string') {
    throw new Error(`任务语义输出缺标题：${JSON.stringify(rawTask)}`);
  }
  if (!Array.isArray(rawTask.labels)) {
    throw new Error(`任务语义输出缺标签列表：${JSON.stringify(rawTask)}`);
  }
  const labels = rawTask.labels
    .map(label => {
      if (typeof label !== 'string') throw new Error(`标签名不是字符串：${JSON.stringify(label)}`);
      return label;
    })
    .sort();
  const dueDate = rawTask.dueDate === '' ? null : rawTask.dueDate;
  if (dueDate !== null && typeof dueDate !== 'string') {
    throw new Error(`截止日不是字符串或 null：${JSON.stringify(rawTask.dueDate)}`);
  }
  return { title: rawTask.title, labels, dueDate };
}

/** 列语义输出：标题 + 任务语义列表（库序）。 */
function normalizeColumn(rawColumn) {
  if (!isRecord(rawColumn) || typeof rawColumn.title !== 'string' || !Array.isArray(rawColumn.tasks)) {
    throw new Error(`列语义输出缺标题或任务列表：${JSON.stringify(rawColumn)}`);
  }
  return { title: rawColumn.title, tasks: rawColumn.tasks.map(normalizeTask) };
}

/**
 * 归一化三端采集的看板语义快照。
 *
 * @param raw - 三端 spec 采集的原始语义快照（见 board-parity.d.mts）
 * @returns 归一化快照（`{ format, version, snapshot }`，可直接与 golden 比较）
 */
export function normalizeParitySnapshot(raw) {
  if (!isRecord(raw) || !isRecord(raw.seed) || !isRecord(raw.afterDrag) || !isRecord(raw.afterEdit)) {
    throw new Error(`看板原始快照缺 seed / afterDrag / afterEdit：${JSON.stringify(raw)}`);
  }
  const { seed, afterDrag, afterEdit } = raw;

  if (typeof seed.boardTitle !== 'string' || !Array.isArray(seed.columns) || !Array.isArray(seed.labels)) {
    throw new Error(`seed 缺 boardTitle / columns / labels：${JSON.stringify(seed)}`);
  }
  const labels = seed.labels.map(label => {
    if (!isRecord(label) || typeof label.name !== 'string' || typeof label.color !== 'string') {
      throw new Error(`标签语义输出缺 name / color：${JSON.stringify(label)}`);
    }
    return { name: label.name, color: label.color };
  });

  if (!Array.isArray(afterDrag.columns)) {
    throw new Error(`afterDrag 缺 columns：${JSON.stringify(afterDrag)}`);
  }
  const afterDragColumns = afterDrag.columns.map(column => {
    if (!isRecord(column) || typeof column.title !== 'string' || !Array.isArray(column.taskTitles)) {
      throw new Error(`拖拽后列输出缺标题或任务标题列表：${JSON.stringify(column)}`);
    }
    for (const title of column.taskTitles) {
      if (typeof title !== 'string') throw new Error(`拖拽后任务标题不是字符串：${JSON.stringify(title)}`);
    }
    return { title: column.title, taskTitles: column.taskTitles };
  });

  if (
    typeof afterEdit.taskTitle !== 'string' ||
    typeof afterEdit.description !== 'string' ||
    (afterEdit.dueDate !== null && typeof afterEdit.dueDate !== 'string') ||
    !Array.isArray(afterEdit.labels)
  ) {
    throw new Error(`afterEdit 字段形状不对：${JSON.stringify(afterEdit)}`);
  }
  for (const name of afterEdit.labels) {
    if (typeof name !== 'string') throw new Error(`afterEdit 标签名不是字符串：${JSON.stringify(name)}`);
  }

  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    snapshot: {
      seed: {
        boardTitle: seed.boardTitle,
        columns: seed.columns.map(normalizeColumn),
        labels
      },
      afterDrag: { columns: afterDragColumns },
      afterEdit: {
        taskTitle: afterEdit.taskTitle,
        description: afterEdit.description,
        dueDate: afterEdit.dueDate,
        labels: [...afterEdit.labels].sort()
      }
    }
  };
}
