/**
 * 查询构建器拖拽编排（对齐 Angular 侧 `QueryGroupComponent` 中的
 * `QueryDragDropHandler` / `UIRuleGroup` / `QueryDropMode`）。
 *
 * Angular 版内嵌在组件文件里；Vue 的 SFC 无法导出符号，拆到本模块。
 */
import type { UIRule } from '@aiao/rxdb-model';
import { ref, type Ref } from 'vue';

/**
 * UI 规则组（宽松类型）
 */
export interface UIRuleGroup {
  id: string;
  combinator: 'and' | 'or';
  rules: Array<UIRule | UIRuleGroup>;
}

export type QueryDropMode = 'before' | 'after' | 'into';

/** 拖拽状态 */
export interface QueryDragDropState {
  draggedItemId: string | null;
  targetItemId: string | null;
  dropMode: QueryDropMode | null;
  isValidTarget: boolean;
  depth?: number;
}

/**
 * 拖拽状态机：记录被拖项、目标项与放置模式，`drop` 时调用移动函数并复位。
 */
export class QueryDragDropHandler {
  /** 当前拖拽状态（响应式） */
  readonly state: Ref<QueryDragDropState> = ref<QueryDragDropState>({
    draggedItemId: null,
    targetItemId: null,
    dropMode: null,
    isValidTarget: false
  });

  constructor(private readonly moveItemFn: (itemId: string, targetGroupId: string, targetIndex: number) => void) {}

  /** 开始拖拽：记录被拖项 */
  start(itemId: string): void {
    this.state.value = { draggedItemId: itemId, targetItemId: null, dropMode: null, isValidTarget: false };
  }

  /** 拖拽经过目标：记录目标与放置模式；更深层的目标优先 */
  over(targetItemId: string, dropMode: QueryDropMode, isValid: boolean, depth: number): void {
    const current = this.state.value;
    if (current.depth !== undefined && depth < current.depth) return;
    this.state.value = { ...current, targetItemId, dropMode, isValidTarget: isValid, depth };
  }

  /** 离开目标：清掉目标但保留被拖项 */
  leave(): void {
    const current = this.state.value;
    this.state.value = { ...current, targetItemId: null, dropMode: null, isValidTarget: false, depth: undefined };
  }

  /** 放置：调用移动函数（服务层拒绝如循环嵌套时静默忽略）并复位 */
  drop(itemId: string, targetGroupId: string, targetIndex: number): void {
    try {
      this.moveItemFn(itemId, targetGroupId, targetIndex);
    } catch {
      // 服务层拒绝（如循环嵌套），静默忽略
    }
    this.reset();
  }

  /** 拖拽结束（未放置）：复位 */
  end(): void {
    this.reset();
  }

  private reset(): void {
    this.state.value = { draggedItemId: null, targetItemId: null, dropMode: null, isValidTarget: false };
  }
}

/** 按 clientY 在目标矩形中的位置计算放置模式（组模式含 into 区间） */
export function calculateDropMode(clientY: number, rect: DOMRect, isGroup: boolean): QueryDropMode {
  const ratio = (clientY - rect.top) / rect.height;
  if (isGroup) {
    if (ratio < 0.25) return 'before';
    if (ratio > 0.75) return 'after';
    return 'into';
  }
  return ratio < 0.5 ? 'before' : 'after';
}
