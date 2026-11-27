import type { PenetrationRecord, RequirementLine } from '@aiao/rxdb-plugin-bom';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BomDemoService } from '../../bom-demo.service';
import { BomWorkspaceState } from '../../bom-workspace-state';
import { ConfigPanel } from '../../components/config-panel';
import { DemoChecks } from '../../components/demo-checks';
import { IntegrationPanel } from '../../components/integration-panel';
import { ReqTree, type RequirementConditionRequest } from '../../components/req-tree';
import { StepPanel, type RequirementCalculationBasis } from '../../components/step-panel';
import { materialLabel } from '../../presentation/material-label';

/** 先选择展开条件，再查看需求结构与所选物料的用量。 */
@Component({
  selector: 'bom-explosion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfigPanel, DemoChecks, FormsModule, IntegrationPanel, ReqTree, RouterLink, StepPanel],
  templateUrl: './explosion.page.html',
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }

      .result-panel {
        min-width: 0;
      }

      .result-panel h2 {
        margin: 0 0 8px;
        font-size: 16px;
      }

      .selected-material {
        margin: 0 0 18px;
        color: var(--color-text-secondary);
      }

      .selected-material strong {
        color: var(--color-primary);
      }

      .mobile-back {
        display: none;
      }

      @media (max-width: 760px) {
        .main.has-selection .tree {
          display: none;
        }
        .main:not(.has-selection) .calculation-panel {
          display: none;
        }
        .mobile-back {
          display: inline-flex;
          margin-bottom: 16px;
        }
      }

      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
    `
  ]
})
export class ExplosionPage {
  private readonly service = inject(BomDemoService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private requestId = 0;
  readonly workspace = inject(BomWorkspaceState);

  readonly ready = this.service.ready;
  readonly itemNos = this.service.itemNos;
  readonly materialLabel = materialLabel;
  readonly designators = this.service.designators;
  readonly asOfDate = this.workspace.asOfDate;
  readonly plannedQty = this.workspace.plannedQty;
  readonly rootKey = this.workspace.rootKey;
  readonly unit = this.workspace.unit;
  readonly view = this.workspace.explosion;
  readonly explodeError = signal('');
  readonly busy = signal(false);
  readonly basis = signal<RequirementCalculationBasis | null>(null);
  readonly basisError = signal('');
  readonly stale = computed(() => {
    const view = this.view();
    return view !== null && (view.key !== this.workspace.contextKey() || view.revision !== this.service.dataRevision());
  });
  readonly complete = computed(() => {
    const result = this.view()?.result;
    return !!result && !result.truncated && result.unresolved.length === 0 && result.manifest.unresolved.length === 0;
  });
  readonly exportable = computed(() => this.complete() && !this.stale() && !this.busy());
  readonly selectedItemNo = computed(() => {
    const line = this.view()?.selected;
    return line ? this.itemNos().get(line.itemId) : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.requestId++);
    effect(() => {
      const epoch = this.service.dataEpoch();
      const revision = this.service.dataRevision();
      const view = untracked(this.view);
      if (this.ready() && (!view || (view.epoch === epoch && view.revision === revision))) return;
      this.requestId++;
      this.view.set(null);
      this.busy.set(false);
      this.basis.set(null);
      this.basisError.set('');
      this.explodeError.set('');
    });
  }

  /** 使用明确的日期、计划量与适用条件计算整机需求。 */
  async runExplode(): Promise<void> {
    if (this.busy() || !this.ready() || this.service.resetting()) return;
    if (this.workspace.validationError()) {
      this.explodeError.set(this.workspace.validationError());
      return;
    }
    const id = ++this.requestId;
    const epoch = this.service.dataEpoch();
    const revision = this.service.dataRevision();
    const context = structuredClone(this.workspace.context());
    const key = this.workspace.contextKey();
    const options = { ...this.workspace.resolutionOptions(), plannedUom: context.plannedUom };
    this.busy.set(true);
    this.explodeError.set('');
    this.view.set(null);
    try {
      const result = await this.service.explode(context.asOfDate, context.plannedQty, context.rootKey, options);
      if (
        id !== this.requestId ||
        epoch !== this.service.dataEpoch() ||
        revision !== this.service.dataRevision() ||
        !this.ready()
      )
        return;
      this.view.set({ result, selected: null, context, key, epoch, revision });
    } catch (error) {
      if (id === this.requestId && epoch === this.service.dataEpoch()) this.explodeError.set(String(error));
    } finally {
      if (id === this.requestId) this.busy.set(false);
    }
  }

  /** 选择一条需求行，联动展示它的数量计算依据。 */
  select(line: RequirementLine): void {
    const current = this.view();
    if (!current) return;
    this.view.set({ ...current, selected: line });
    this.workspace.selectedItem.set(this.itemNos().get(line.itemId) ?? current.context.rootKey);
    this.basis.set(null);
    this.basisError.set('');
    void this.readBasis(line, current.epoch);
    if (window.matchMedia('(max-width: 760px)').matches) {
      afterNextRender(
        () => {
          const heading = this.element.nativeElement.querySelector<HTMLElement>('.calculation-panel h2');
          heading?.focus();
          heading?.scrollIntoView({ block: 'start' });
        },
        { injector: this.injector }
      );
    }
  }

  /** 从提示就地选择备选或替代；缺少序列与批次时移入对应输入。 */
  async applyCondition(request: RequirementConditionRequest): Promise<void> {
    if (request.kind === 'alternative') this.workspace.alternativeNo.set(request.alternativeNo);
    if (request.kind === 'substitute')
      this.workspace.substituteSelections.update(values => ({
        ...values,
        [request.groupId]: { memberKey: request.memberKey }
      }));
    if (request.kind === 'unit' || request.kind === 'lot') {
      document.querySelector<HTMLInputElement>(`[data-testid="${request.kind}-input"]`)?.focus();
      return;
    }
    await this.runExplode();
  }

  /** 读取该需求路径经过的虚拟件穿透记录。 */
  penetrationsOn(line: RequirementLine | null): PenetrationRecord[] {
    const result = this.view()?.result;
    if (!line || !result) return [];
    const pathKey = line.path.join('>');
    return result.penetrations.filter(entry => pathKey.startsWith(entry.path.join('>')));
  }

  /** 用户显式切换根物料时显示并采用适用的批量单位。 */
  changeRoot(root: string): void {
    this.workspace.update({ rootKey: root, plannedUom: this.service.itemUoms().get(root)! });
  }

  clearSelection(): void {
    this.view.update(view => (view ? { ...view, selected: null } : null));
    this.basis.set(null);
    afterNextRender(
      () => {
        const row = this.element.nativeElement.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]');
        row?.focus();
        row?.scrollIntoView({ block: 'nearest' });
      },
      { injector: this.injector }
    );
  }

  private async readBasis(line: RequirementLine, epoch: number): Promise<void> {
    try {
      const basis = await this.service.readCalculationBasis(line);
      if (epoch === this.service.dataEpoch() && this.view()?.selected === line) this.basis.set(basis);
    } catch (error) {
      if (epoch === this.service.dataEpoch() && this.view()?.selected === line) this.basisError.set(String(error));
    }
  }
}
