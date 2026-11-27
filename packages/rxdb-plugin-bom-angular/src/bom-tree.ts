import {
  BOM_VIEW_STYLES,
  bomErrorText,
  handleBomTreeKey,
  type BomViewCommands,
  type BomViewNode,
  type BomViewState
} from '@aiao/rxdb-plugin-bom';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
  viewChildren,
  type ElementRef
} from '@angular/core';

/** 一次行加载失败与发起时的那一版节点。 */
interface TreeInteraction {
  nodes: readonly BomViewNode[];
  error: unknown;
}

/**
 * 展示共享可见路径与查询状态的 BOM 树（对齐 React `BomTree`、Vue `BomTree`）。
 *
 * @remarks
 * 交互一律经 `commands` 回到共享控制器，不发出组件事件。键盘遵循 WAI-ARIA tree 模式：
 * 方向键移动焦点（ArrowLeft 无父节点时不动），Home/End 跳到首尾，Space 切换展开，
 * Enter 加载发生项；当前焦点节点不在可见节点中时首行是 Tab 入口。行加载失败的原始错误
 * 只对发起时的那一版节点列表显示：共享状态发布新的节点列表（换输入、换库、刷新出新结果、
 * 展开折叠）即撤下，换之前发起、之后才失败的加载也不回写。
 */
@Component({
  selector: 'ao-bom-tree',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }', BOM_VIEW_STYLES],
  template: `
    <section
      class="bom-view bom-tree"
      [attr.aria-busy]="state().refreshing || state().phase === 'loading'"
      aria-label="BOM 展开"
    >
      @if (state().phase === 'idle' || state().phase === 'loading') {
        <p role="status">正在加载 BOM…</p>
      }
      @if (state().phase === 'empty') {
        <p role="status">没有可见 BOM 节点</p>
      }
      @if (state().refreshing) {
        <p role="status">正在刷新 BOM…</p>
      }
      @if (state().error !== null) {
        <p role="alert">{{ errorText(state().error) }}</p>
      }
      @if (state().phase === 'error') {
        <button (click)="commands().refresh()" type="button">重试</button>
      }
      <ul aria-label="BOM 结构" role="tree">
        @for (node of state().nodes; track node.key; let index = $index) {
          <li
            #row
            [attr.aria-expanded]="node.hasChildren ? node.expanded : null"
            [attr.aria-level]="node.depth + 1"
            [attr.aria-selected]="
              node.occurrenceId !== null && state().editor.value?.occurrenceId === node.occurrenceId
            "
            [attr.data-occurrence]="node.occurrenceId ?? ''"
            [attr.data-path]="node.key"
            [tabIndex]="focused() === node.key || (!hasFocused() && index === 0) ? 0 : -1"
            (click)="row.focus(); edit(node)"
            (focus)="focused.set(node.key)"
            (keydown)="keyDown($event, node, index)"
            data-testid="bom-node"
            role="treeitem"
          >
            <div class="bom-node-content" [style.padding-inline-start.px]="node.depth * 24">
              @if (node.hasChildren) {
                <button
                  [attr.aria-label]="(node.expanded ? '折叠 ' : '展开 ') + node.itemNo"
                  (click)="$event.stopPropagation(); commands().toggle(node.path)"
                  tabindex="-1"
                  type="button"
                >
                  {{ node.expanded ? '−' : '+' }}
                </button>
              }
              <span>{{ node.itemNo }}</span>
              @if (node.description) {
                <span>{{ node.description }}</span>
              }
              <span class="bom-node-quantity" data-testid="bom-quantity">{{
                node.quantity ? node.quantity.value + ' ' + node.quantity.uom : '未解析'
              }}</span>
              @if (node.occurrenceId !== null) {
                <button
                  [attr.aria-label]="'编辑 ' + node.itemNo"
                  (click)="$event.stopPropagation(); edit(node)"
                  tabindex="-1"
                  type="button"
                >
                  编辑
                </button>
              }
            </div>
          </li>
        }
      </ul>
      @if (state().unresolved.length > 0) {
        <section aria-label="未解析候选">
          <h3>未解析</h3>
          @for (group of state().unresolved; track group.key) {
            <div data-testid="bom-candidate">
              <span>{{ group.kind }}</span>
              <ul>
                @for (candidate of group.candidates; track candidate.key) {
                  <li>{{ candidate.label }}</li>
                }
              </ul>
            </div>
          }
        </section>
      }
      @if (state().truncated !== null) {
        <p role="note">结果已截断：{{ state().truncated?.reason }}</p>
      }
      @if (state().quantityError !== null) {
        <p role="alert">{{ errorText(state().quantityError) }}</p>
      }
      @if (interactionError() !== null) {
        <p role="alert">{{ errorText(interactionError()) }}</p>
      }
    </section>
  `
})
export class BomTree {
  readonly #interaction = signal<TreeInteraction | null>(null);
  /** 共享控制器发布的视图状态（`useBomView` 的 `state()`）。 */
  readonly state = input.required<BomViewState>();
  /** 共享控制器命令，原样透传。 */
  readonly commands = input.required<BomViewCommands>();
  readonly rows = viewChildren<ElementRef<HTMLLIElement>>('row');
  readonly focused = signal<string | null>(null);
  /** 行加载失败的原始错误；按节点数组身份失效，对照行编辑器表单错误随 `editor.value` 重置。 */
  readonly interactionError = computed(() => {
    const interaction = this.#interaction();
    return interaction !== null && interaction.nodes === this.state().nodes ? interaction.error : null;
  });
  readonly hasFocused = computed(() => this.state().nodes.some(node => node.key === this.focused()));
  readonly errorText = bomErrorText;

  async edit(node: BomViewNode): Promise<void> {
    if (node.occurrenceId === null) return;
    const nodes = this.state().nodes;
    this.#interaction.set(null);
    try {
      await this.commands().loadOccurrence(node.occurrenceId);
    } catch (error) {
      this.#interaction.set({ nodes, error });
    }
  }

  keyDown(event: KeyboardEvent, _node: BomViewNode, index: number): void {
    if (
      handleBomTreeKey(event.key, this.state().nodes, index, {
        focus: target => this.focus(target),
        toggle: path => this.commands().toggle(path),
        edit: node => {
          void this.edit(node);
        }
      })
    )
      event.preventDefault();
  }

  private focus(index: number): void {
    this.rows()[Math.max(0, Math.min(index, this.rows().length - 1))]?.nativeElement.focus();
  }
}
