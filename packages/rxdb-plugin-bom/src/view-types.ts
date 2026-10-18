import type { Observable } from 'rxjs';
import type { BomLineOccurrence } from './entities.js';
import type { ExplosionResult, PlannedQuantity } from './quantity/explosion.js';
import type { ExpansionBudgets, ExpansionNode, ExpansionResult } from './resolve/expansion.js';
import type { ResolutionContext } from './resolve/resolution.js';
import type { ResolveTarget } from './resolve/resolver.js';

/** 三框架共用的显式查询输入，不读取系统日期或全局数据库。 */
export interface BomViewInput {
  context: ResolutionContext;
  target: ResolveTarget;
  plannedQty: PlannedQuantity;
  budgets?: ExpansionBudgets;
  params?: Record<string, string>;
}

/** 同一读事务中的结构、数量与物料显示信息。 */
export interface BomViewSnapshot {
  expansion: ExpansionResult;
  explosion: ExplosionResult | null;
  quantityError: unknown | null;
  items: readonly { id: string; itemNo: string; description: string | null }[];
  refreshing: boolean;
}

/** 一个可见路径节点；相同物料在不同路径上有不同的 key。 */
export interface BomViewNode extends ExpansionNode {
  key: string;
  itemNo: string;
  description: string | null;
  quantity: PlannedQuantity | null;
  hasChildren: boolean;
  expanded: boolean;
}

/** 尚未裁决的候选组，只展示，不隐式选择。 */
export interface BomViewCandidate {
  key: string;
  kind: 'alternative' | 'manual' | 'unit' | 'lot';
  candidates: readonly { key: string; label: string }[];
}

/** 行编辑仅暴露已交付的四类字段，写入仍经过 BOM 仓储。 */
export type BomOccurrencePatch = Partial<
  Pick<BomLineOccurrence, 'qty' | 'componentScrap' | 'operationSeq' | 'effectiveFrom' | 'effectiveTo'>
>;

/** 当前编辑发生项与真实写入边界。 */
export interface BomLineEditorValue {
  occurrenceId: string;
  qty: string | null;
  componentScrap: string;
  operationSeq: number | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  editable: boolean;
  readOnlyReason: string | null;
}

/** 独立行编辑的加载、保存与原始错误。 */
export interface BomLineEditorState {
  phase: 'idle' | 'loading' | 'success' | 'error';
  value: BomLineEditorValue | null;
  saving: boolean;
  error: unknown | null;
}

/** 三端使用同一状态；后台刷新保留原节点，避免销毁未变路径的 DOM。 */
export interface BomViewState {
  phase: 'idle' | 'loading' | 'empty' | 'success' | 'error';
  nodes: readonly BomViewNode[];
  unresolved: readonly BomViewCandidate[];
  truncated: ExpansionResult['truncated'];
  quantityError: unknown | null;
  error: unknown | null;
  refreshing: boolean;
  editor: BomLineEditorState;
}

/** 三框架绑定原样透传的共享命令。 */
export interface BomViewCommands {
  /** 替换完整查询输入，迟到结果不得覆盖新输入。 */
  setInput(input: BomViewInput): void;
  /** 重订阅当前输入，允许失败后重试。 */
  refresh(): void;
  /** 只切换给定发生项路径的展开状态。 */
  toggle(path: readonly string[]): void;
  /** 独立读取草稿或 ECN 新发生项的编辑数据。 */
  loadOccurrence(id: string): Promise<void>;
  /** 保存当前发生项；已发布既有行拒绝，draft ECN新行的日期仍由ECN派生，失败保留领域错误。 */
  saveOccurrence(patch: BomOccurrencePatch): Promise<void>;
  /** 重读当前完整输入；数量错误、未裁决候选或截断时明确拒绝。 */
  calculate(): Promise<ExplosionResult>;
}

/** 共享控制器；框架层负责订阅并在销毁时释放。 */
export interface BomViewHandle extends BomViewCommands {
  /** 首次订阅启动查询，最后订阅释放后可重新订阅。 */
  readonly state$: Observable<BomViewState>;
  /** 结束订阅与状态流；销毁后新订阅立即完成、命令拒绝，重复销毁幂等。 */
  destroy(): void;
}

/** 原生有标签表单的字符串输入，三端共用转换入口。 */
export interface BomEditorFields {
  qty: string;
  componentScrap: string;
  operationSeq: string;
  effectiveFrom: string;
  effectiveTo: string;
}
