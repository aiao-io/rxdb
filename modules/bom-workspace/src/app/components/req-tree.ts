import type { ExplosionResult, OutputLine, RequirementLine, UnresolvedAlternative } from '@aiao/rxdb-plugin-bom';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked
} from '@angular/core';
import { formatDecimal } from '../presentation/decimal-format';
import { itemLabelById, itemNoById } from '../presentation/material-label';
import {
  buildRequirementTree,
  flattenRequirementTree,
  type RequirementTreeNode
} from '../presentation/requirement-tree';

/** 把选择与补条件交给当前任务，不在树内修改领域数据。 */
export type RequirementConditionRequest =
  | { kind: 'alternative'; alternativeNo: number }
  | { kind: 'substitute'; groupId: string; groupCode: string; memberKey: string }
  | { kind: 'unit' | 'lot'; lineId?: string };

/** 发生项路径树：受控展开、单一键盘焦点与可追踪的虚拟件穿透。 */
@Component({
  selector: 'bom-req-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (result().truncated; as truncated) {
      <div class="error-box" role="alert">
        <p>结构尚未完整展开，当前数量仅供查看。请缩小范围后重试。</p>
        <details>
          <summary>查看限制原因</summary>
          <code>{{ truncated.reason }}</code>
        </details>
      </div>
    }
    @for (unresolved of result().manifest.unresolved; track $index) {
      <div class="panel-inset" data-testid="unit-unresolved">
        <h3>
          {{ unresolved.reason === 'unit' || unresolved.reason === 'lot' ? '请填写序列号或批次' : '请选择备选方案' }}
        </h3>
        <p class="hint">补齐适用条件后，才能确定这部分物料的需求。</p>
        @for (candidate of unresolved.candidates; track $index) {
          <div class="candidate-row" data-testid="unit-candidate">
            <strong>{{
              candidate.childItemId ? itemLabel(candidate.childItemId) : '备选方案 ' + candidate.alternativeNo
            }}</strong>
            @if (candidate.unitFrom !== undefined || candidate.unitTo !== undefined) {
              <span>序列 {{ candidate.unitFrom ?? 1 }} ～ {{ candidate.unitTo ?? '不限' }}</span>
            }
            @if (candidate.lotCodes?.length) {
              <span>批次 {{ candidate.lotCodes.join('、') }}</span>
            }
            @if (!unresolved.reason) {
              <button
                class="btn btn-sm"
                (click)="conditionRequest.emit({ kind: 'alternative', alternativeNo: candidate.alternativeNo })"
              >
                采用备选 {{ candidate.alternativeNo }}
              </button>
            }
          </div>
        }
        @if (unresolved.reason) {
          <button class="btn btn-sm" (click)="requestCondition(unresolved)">
            {{ unresolved.reason === 'unit' ? '填写序列号' : '填写批次' }}
          </button>
        }
      </div>
    }
    @for (group of result().unresolved; track group.groupId) {
      <div class="panel-inset">
        <h3>请选择替代物料 · {{ group.groupCode }}</h3>
        <p class="hint">当前组需要明确选择，数量尚不能作为完整需求。</p>
        @for (candidate of group.candidates; track candidate.occurrenceId) {
          <button
            class="btn btn-sm"
            (click)="
              conditionRequest.emit({
                kind: 'substitute',
                groupId: group.groupId,
                groupCode: group.groupCode,
                memberKey: candidate.itemId
              })
            "
          >
            选择{{ itemLabel(candidate.itemId) }}
          </button>
        }
      </div>
    }
    @if (breadcrumb().length > 0) {
      <nav class="selection-path" aria-label="所选发生项路径">
        @for (node of breadcrumb(); track node.key; let last = $last) {
          <span
            >{{ label(node) }}
            @if (!last) {
              <span aria-hidden="true"> › </span>
            }
          </span>
        }
      </nav>
    }
    <div class="tree-tools">
      <button class="btn btn-sm" (click)="collapseToRoot()">收起分支</button>
      <label
        >层级缩进
        <select [value]="indent()" (change)="changeIndent($event)" aria-label="层级缩进">
          <option value="12">紧凑</option>
          <option value="20">舒展</option>
        </select>
      </label>
      <span class="hint">方向键浏览，左右键展开或收起，Enter 选择。</span>
    </div>
    <div class="requirement-tree" aria-label="物料需求发生项树" role="tree">
      @for (node of renderedNodes(); track node.key) {
        <div
          class="tree-node"
          [attr.aria-expanded]="node.children.length ? expanded().has(node.key) : null"
          [attr.aria-level]="node.depth + 1"
          [attr.aria-selected]="node.line ? selectedKey() === node.key : null"
          [attr.data-direction]="node.output?.direction"
          [attr.data-item]="itemNo(node.itemId)"
          [attr.data-kind]="node.kind"
          [attr.data-node-key]="node.key"
          [attr.data-output]="node.output ? itemNo(node.itemId) : null"
          [attr.tabindex]="activeKey() === node.key ? 0 : -1"
          [class.output]="node.kind === 'output'"
          [class.requirement-row]="node.kind === 'requirement'"
          [class.selected]="selectedKey() === node.key"
          [style.padding-inline-start.px]="8 + boundedIndent(node.depth)"
          (click)="activate(node)"
          (focus)="focusedKey.set(node.key)"
          (keydown)="onKeydown($event, node)"
          role="treeitem"
        >
          @if (node.children.length > 0) {
            <button
              class="branch-toggle"
              [attr.aria-label]="(expanded().has(node.key) ? '收起' : '展开') + label(node)"
              (click)="toggleFromButton($event, node)"
              tabindex="-1"
            >
              {{ expanded().has(node.key) ? '−' : '+' }}
            </button>
          } @else {
            <span class="leaf-marker" aria-hidden="true">·</span>
          }
          <span class="item-code">{{ label(node) }}</span>
          @if (node.depth > 4) {
            <span class="depth-marker">第 {{ node.depth }} 层</span>
          }
          @if (node.line; as line) {
            <span class="qty" [attr.data-qty]="line.qty" [title]="line.qty + ' ' + line.uom"
              >{{ quantity(line.qty) }} {{ line.uom }}</span
            >
            @if (designatorsOf(line).length > 0) {
              <span class="designators" [attr.data-designators]="designatorsOf(line).join(',')"
                >位号：{{ designatorsOf(line).join(', ') }}</span
              >
            }
          }
          @if (node.penetration; as penetration) {
            <span class="node-note"
              >虚拟件穿透 · 不另计需求 · 下层计划量 {{ quantity(penetration.childPlanned.value) }}
              {{ penetration.childPlanned.uom }} ·
              {{ penetration.source === 'override' ? '发生项设置' : '物料修订设置' }}</span
            >
          }
          @if (node.output; as item) {
            <span class="qty" [attr.data-qty]="item.qty" [title]="item.qty + ' ' + item.uom"
              >{{ quantity(item.qty) }} {{ item.uom }}</span
            >
            <span class="node-note">{{ outputLabel(item.direction) }} · 产出不计入投入需求</span>
          }
        </div>
      }
    </div>
    @if (visibleNodes().length > renderedNodes().length) {
      <div class="tree-more">
        <span class="hint">已显示 {{ renderedNodes().length }} / {{ visibleNodes().length }} 个可见节点</span
        ><button class="btn btn-sm" (click)="showMore()">继续显示 150 条</button>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .tree-tools,
      .tree-more,
      .candidate-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin: 12px 0;
      }
      .tree-tools label {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      .tree-tools .hint {
        flex-basis: 100%;
      }
      .selection-path {
        padding: 10px 0;
        color: var(--color-text-secondary);
        overflow-wrap: anywhere;
      }
      .requirement-tree {
        min-width: 0;
      }
      .tree-node {
        display: flex;
        min-width: 0;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        padding: 9px 10px;
        border-bottom: 1px solid var(--color-border);
        border-radius: 5px;
      }
      .tree-node.selected {
        background: var(--color-selected);
        box-shadow: inset 3px 0 0 var(--color-primary);
      }
      .tree-node.output {
        background: var(--color-surface-alt);
        color: var(--color-text-secondary);
      }
      .tree-node .qty {
        margin-left: auto;
        font-weight: 650;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .tree-node[data-kind='root'] {
        font-weight: 600;
        background: var(--color-surface-alt);
      }
      .item-code {
        min-width: 0;
        flex: 1 1 100px;
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      .node-note,
      .designators {
        flex-basis: 100%;
        overflow-wrap: anywhere;
        color: var(--color-text-secondary);
      }
      .depth-marker {
        color: var(--color-text-muted);
        font-size: 12px;
      }
      .branch-toggle,
      .leaf-marker {
        display: inline-grid;
        place-items: center;
        width: 28px;
        min-height: 28px;
        flex: 0 0 28px;
      }
      .branch-toggle {
        padding: 0;
        border: 1px solid var(--color-border);
        border-radius: 5px;
        color: var(--color-primary);
        background: var(--color-surface);
      }
      .leaf-marker {
        color: var(--color-text-muted);
      }
      @media (max-width: 640px) {
        .item-code {
          flex-basis: 80px;
        }
      }
    `
  ]
})
export class ReqTree {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  readonly result = input.required<ExplosionResult>();
  readonly selected = input<RequirementLine | null>(null);
  readonly itemNos = input.required<Map<string, string>>();
  readonly designators = input.required<Map<string, string[]>>();
  readonly rootLabel = input<string>();
  readonly initialDepth = input(2);
  readonly rowSelect = output<RequirementLine>();
  readonly conditionRequest = output<RequirementConditionRequest>();
  readonly tree = computed(() => buildRequirementTree(this.result()));
  readonly expanded = signal(new Set<string>());
  readonly focusedKey = signal('[]');
  readonly indent = signal(12);
  readonly renderLimit = signal(151);
  readonly selectedKey = computed(() => (this.selected() ? JSON.stringify(this.selected()!.path) : null));
  readonly visibleNodes = computed(() => flattenRequirementTree(this.tree(), this.expanded()));
  readonly renderedNodes = computed(() => {
    const nodes = this.visibleNodes();
    const limit = this.renderLimit();
    const index = nodes.findIndex(node => node.key === this.focusedKey());
    if (index < limit) return nodes.slice(0, limit);
    const focused = nodes[index];
    const ancestors = new Set(
      Array.from({ length: focused.path.length }, (_, depth) => JSON.stringify(focused.path.slice(0, depth)))
    );
    const nearby = nodes.slice(Math.max(0, index - limit + ancestors.size + 1), index + 1);
    const included = new Set([...ancestors, ...nearby.map(node => node.key)]);
    return nodes.filter(node => included.has(node.key));
  });
  readonly activeKey = computed(() =>
    this.renderedNodes().some(node => node.key === this.focusedKey()) ? this.focusedKey() : this.tree().key
  );
  readonly breadcrumb = computed(() => {
    const selected = this.selected();
    if (!selected) return [];
    const nodes = [this.tree()];
    let current = this.tree();
    for (let depth = 1; depth <= selected.path.length; depth++) {
      const key = JSON.stringify(selected.path.slice(0, depth));
      const child = current.children.find(node => node.key === key);
      if (!child) return nodes;
      nodes.push(child);
      current = child;
    }
    return nodes;
  });

  constructor() {
    effect(() => {
      const root = this.tree();
      const depth = this.initialDepth();
      const expanded = new Set<string>();
      const pending = [root];
      while (pending.length > 0) {
        const node = pending.pop()!;
        if (node.depth >= depth) continue;
        expanded.add(node.key);
        pending.push(...node.children);
      }
      this.expanded.set(expanded);
      this.focusedKey.set(root.key);
      this.renderLimit.set(151);
    });
    effect(() => {
      this.tree();
      const selected = this.selected();
      if (!selected) return;
      const expanded = new Set(untracked(this.expanded));
      for (let depth = 0; depth < selected.path.length; depth++)
        expanded.add(JSON.stringify(selected.path.slice(0, depth)));
      this.expanded.set(expanded);
      this.focusedKey.set(JSON.stringify(selected.path));
    });
  }

  itemNo(itemId: string): string {
    return itemNoById(this.itemNos(), itemId);
  }
  itemLabel(itemId: string): string {
    return itemLabelById(this.itemNos(), itemId);
  }
  label(node: RequirementTreeNode): string {
    return node.kind === 'root' ? (this.rootLabel() ?? this.itemLabel(node.itemId)) : this.itemLabel(node.itemId);
  }
  quantity(value: string): string {
    return formatDecimal(value, { fractionDigits: 6, trimTrailingZeros: true });
  }
  outputLabel(direction: OutputLine['direction']): string {
    return { by_product: '副产品', scrap_out: '废料', produce: '联产品' }[direction];
  }
  boundedIndent(depth: number): number {
    return Math.min(depth, 4) * this.indent();
  }
  designatorsOf(line: RequirementLine): string[] {
    return this.designators().get(line.path[line.path.length - 1]) ?? [];
  }

  requestCondition(unresolved: UnresolvedAlternative): void {
    if (unresolved.reason) this.conditionRequest.emit({ kind: unresolved.reason, lineId: unresolved.lineId });
  }

  activate(node: RequirementTreeNode): void {
    this.focusedKey.set(node.key);
    if (node.line) this.rowSelect.emit(node.line);
  }

  toggleFromButton(event: Event, node: RequirementTreeNode): void {
    event.stopPropagation();
    this.toggle(node);
    this.focusNode(node.key);
  }

  collapseToRoot(): void {
    this.expanded.set(new Set([this.tree().key]));
    this.focusedKey.set(this.tree().key);
    this.renderLimit.set(151);
  }

  showMore(): void {
    this.renderLimit.update(limit => limit + 150);
  }

  changeIndent(event: Event): void {
    if (event.target instanceof HTMLSelectElement) this.indent.set(Number(event.target.value));
  }

  onKeydown(event: KeyboardEvent, node: RequirementTreeNode): void {
    const nodes = this.visibleNodes();
    const index = nodes.findIndex(current => current.key === node.key);
    const direction = event.key;
    if (direction === 'ArrowDown' || direction === 'ArrowUp') {
      event.preventDefault();
      this.focusNode(nodes[Math.max(0, Math.min(nodes.length - 1, index + (direction === 'ArrowDown' ? 1 : -1)))].key);
    }
    if (direction === 'Home' || direction === 'End') {
      event.preventDefault();
      this.focusNode(nodes[direction === 'Home' ? 0 : nodes.length - 1].key);
    }
    if (direction === 'ArrowRight') {
      event.preventDefault();
      if (!this.expanded().has(node.key) && node.children.length) this.toggle(node);
      else if (node.children.length) this.focusNode(node.children[0].key);
    }
    if (direction === 'ArrowLeft') {
      event.preventDefault();
      if (this.expanded().has(node.key) && node.children.length) this.toggle(node);
      else this.focusNode(JSON.stringify(node.path.slice(0, -1)));
    }
    if (direction === 'Enter' || direction === ' ') {
      event.preventDefault();
      if (node.line) this.activate(node);
      else if (node.children.length) this.toggle(node);
    }
  }

  private toggle(node: RequirementTreeNode): void {
    const expanded = new Set(this.expanded());
    if (!expanded.delete(node.key)) expanded.add(node.key);
    this.expanded.set(expanded);
  }

  private focusNode(key: string): void {
    this.focusedKey.set(key);
    afterNextRender(
      () => {
        const rows = this.element.nativeElement.querySelectorAll<HTMLElement>('[data-node-key]');
        [...rows].find(row => row.dataset['nodeKey'] === key)?.focus();
      },
      { injector: this.injector }
    );
  }
}
