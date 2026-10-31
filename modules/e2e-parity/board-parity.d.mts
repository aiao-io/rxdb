/**
 * 看板跨框架对拍 e2e 共享模块的类型契约（与 `board-parity.mjs` 同步维护）。
 *
 * 三个 e2e 项目的 tsconfig `rootDir` 都是自己的项目目录，跨项目 import .ts 源码会触发
 * TS6059 / TS6307；以本声明文件 + 同名 .mjs 实现成对放置（spec 相对 import `.mjs`，
 * tsc 找到这里），tsc 只把这里当纯类型输入，运行期由 Playwright / Node 加载 .mjs。
 *
 * @module e2e-parity
 */

/** 任务语义输出（由三端 spec 从 DOM 采集）。 */
export interface BoardParityTaskRaw {
  /** 任务标题。 */
  title: string;
  /** 卡片上的标签名列表（DOM 序；归一化会按名排序）。 */
  labels: string[];
  /** 卡片上的截止日文本；无截止日为 `null` 或空串（归一化为 null）。 */
  dueDate: string | null;
}

/** 列语义输出（任务按库序）。 */
export interface BoardParityColumnRaw {
  /** 列标题。 */
  title: string;
  /** 列内任务（库序）。 */
  tasks: BoardParityTaskRaw[];
}

/** 标签定义输出（归一化后颜色是 getComputedStyle 的 rgb() 串）。 */
export interface BoardParityLabelRaw {
  name: string;
  color: string;
}

/** 拖拽后的列任务序列。 */
export interface BoardParityAfterDragColumnRaw {
  title: string;
  taskTitles: string[];
}

/** 归一化前、由三端 spec 采集的看板原始快照。 */
export interface BoardParityRaw {
  seed: {
    /** 当前板标题（头部改名按钮文案）。 */
    boardTitle: string;
    columns: BoardParityColumnRaw[];
    labels: BoardParityLabelRaw[];
  };
  /** 同一组真实拖拽后重查的列任务序列。 */
  afterDrag: {
    columns: BoardParityAfterDragColumnRaw[];
  };
  /** 同一组详情编辑保存并重开后的读回值。 */
  afterEdit: {
    taskTitle: string;
    description: string;
    dueDate: string | null;
    labels: string[];
  };
}

/** 归一化后的任务语义。 */
export interface BoardParityTask {
  title: string;
  labels: string[];
  dueDate: string | null;
}

/** 归一化后的快照（可直接与 golden 比较）。 */
export interface BoardParitySnapshot {
  format: string;
  version: number;
  snapshot: {
    seed: {
      boardTitle: string;
      columns: Array<{ title: string; tasks: BoardParityTask[] }>;
      labels: Array<{ name: string; color: string }>;
    };
    afterDrag: {
      columns: Array<{ title: string; taskTitles: string[] }>;
    };
    afterEdit: {
      taskTitle: string;
      description: string;
      dueDate: string | null;
      labels: string[];
    };
  };
}

/**
 * 归一化三端采集的看板语义快照（seed / afterDrag / afterEdit）。
 */
export declare function normalizeParitySnapshot(raw: BoardParityRaw): BoardParitySnapshot;

/**
 * 读取 checked-in 的 golden 语义快照（`board-parity.golden.json`）。
 *
 * @param specFile - 调用方 spec 的绝对路径（Playwright `testInfo.file`；golden 与本模块
 *   相对位置固定，由 spec 文件路径推导）
 */
export declare function loadParityGolden(specFile: string): BoardParitySnapshot;
