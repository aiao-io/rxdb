import {
  BOM_VIEW_STYLES,
  bomErrorText,
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

/** 展示共享可见路径与查询状态的 BOM 树。 */
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
  readonly state = input.required<BomViewState>();
  readonly commands = input.required<BomViewCommands>();
  readonly rows = viewChildren<ElementRef<HTMLLIElement>>('row');
  readonly focused = signal<string | null>(null);
  readonly interactionError = signal<unknown>(null);
  readonly hasFocused = computed(() => this.state().nodes.some(node => node.key === this.focused()));
  readonly errorText = bomErrorText;

  async edit(node: BomViewNode): Promise<void> {
    if (node.occurrenceId === null) return;
    this.interactionError.set(null);
    try {
      await this.commands().loadOccurrence(node.occurrenceId);
    } catch (error) {
      this.interactionError.set(error);
    }
  }

  keyDown(event: KeyboardEvent, node: BomViewNode, index: number): void {
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowDown') this.focus(index + 1);
    if (event.key === 'ArrowUp') this.focus(index - 1);
    if (event.key === 'Home') this.focus(0);
    if (event.key === 'End') this.focus(this.state().nodes.length - 1);
    if (event.key === 'Enter') void this.edit(node);
    if (event.key === ' ' && node.hasChildren) this.commands().toggle(node.path);
    if (event.key === 'ArrowRight' && node.hasChildren && !node.expanded) this.commands().toggle(node.path);
    const next = this.state().nodes[index + 1];
    if (event.key === 'ArrowRight' && node.expanded && next && next.depth > node.depth) this.focus(index + 1);
    if (event.key !== 'ArrowLeft') return;
    if (node.hasChildren && node.expanded) this.commands().toggle(node.path);
    else this.focus(this.state().nodes.findIndex(parent => parent.key === JSON.stringify(node.path.slice(0, -1))));
  }

  private focus(index: number): void {
    this.rows()[Math.max(0, Math.min(index, this.rows().length - 1))]?.nativeElement.focus();
  }
}
