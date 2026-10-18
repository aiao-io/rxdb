import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, SqliteRepository, type WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { BOM_ENTITIES, bomErrorText, rxDBPluginBom, type BomViewInput, type BomViewState } from '@aiao/rxdb-plugin-bom';
import { BomLineEditor, BomTree, useBomView, type BomViewBinding } from '@aiao/rxdb-plugin-bom-angular';
import {
  BOM_VIEW_FIXTURE_DATES,
  loadBomViewFixture,
  type BomViewFixture,
  type BomViewFixtureIds,
  type BomViewFixtureRoot
} from '@aiao/rxdb-plugin-bom/testing';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  ViewEncapsulation,
  computed,
  inject,
  input,
  output,
  runInInjectionContext,
  signal,
  type OnChanges,
  type OnDestroy,
  type OnInit
} from '@angular/core';

interface BomDemoSession {
  db: RxDB;
  fixture: BomViewFixture;
}

interface BomDemoApi {
  ids: BomViewFixtureIds;
  readonly state: BomViewState | null;
}

const roots: readonly BomViewFixtureRoot[] = [
  'main',
  'alternative',
  'manual',
  'unit',
  'lot',
  'config',
  'formula',
  'draft',
  'performance'
];
const initialRoot = (): BomViewFixtureRoot => {
  const root = new URLSearchParams(window.location.search).get('root');
  if (root === null) return 'main';
  if (!roots.includes(root as BomViewFixtureRoot)) throw new Error(`未知 BOM 目标：${root}`);
  return root as BomViewFixtureRoot;
};

const demoStyles = `
.bom-view-demo { max-width: 1200px; margin: 0 auto; padding: 24px; color: #172337; font: 15px/1.5 system-ui, sans-serif; }
.bom-view-demo h1 { margin: 0 0 12px; font-size: 28px; font-weight: 700; }
.bom-demo-controls, .bom-demo-actions { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
.bom-demo-controls label { display: grid; gap: 4px; }
.bom-view-demo button, .bom-view-demo input, .bom-view-demo select { border: 1px solid #718096; border-radius: 4px; padding: 6px 10px; background: #fff; color: #172337; font: inherit; }
.bom-view-demo button:disabled { opacity: .65; }
.bom-demo-panels { display: grid; grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); gap: 16px; }
.bom-view-demo [role=alert] { color: #9b1c1c; white-space: pre-wrap; }
@media (max-width: 720px) { .bom-demo-panels { grid-template-columns: 1fr; } }
`;

const createDatabase = (): RxDB => {
  const db = new RxDB({
    dbName: `bom-a-${crypto.randomUUID()}`,
    entities: [...BOM_ENTITIES],
    sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
  });
  db.use(rxDBPluginBom);
  db.adapter(
    'wa-sqlite',
    database =>
      new RxDBAdapterWaSqlite(database, {
        vfs: 'MemoryAsyncVFS',
        async: true,
        worker: false,
        wasmPath: new URL('wa-sqlite/wa-sqlite-async.wasm', document.baseURI).href,
        batchTimeout: 1,
        repositories: { BomRepository: SqliteRepository } as unknown as WaSqliteOptions['repositories']
      })
  );
  return db;
};

@Component({
  selector: 'app-bom-demo-panels',
  standalone: true,
  imports: [BomTree, BomLineEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as view) {
      <div class="bom-demo-panels">
        <ao-bom-tree [commands]="view.commands" [state]="view.state()" />
        <ao-bom-line-editor [commands]="view.commands" [state]="view.state()" />
      </div>
    }
  `
})
class BomDemoPanels implements OnInit, OnChanges, OnDestroy {
  private readonly injector = inject(Injector);
  readonly db = input.required<RxDB>();
  readonly query = input.required<BomViewInput>();
  readonly viewChange = output<BomViewBinding | null>();
  readonly view = signal<BomViewBinding | null>(null);

  ngOnInit(): void {
    const view = runInInjectionContext(this.injector, () => useBomView(this.db(), this.query()));
    this.view.set(view);
    this.viewChange.emit(view);
  }

  ngOnChanges(): void {
    this.view()?.commands.setInput(this.query());
  }

  ngOnDestroy(): void {
    this.viewChange.emit(null);
  }
}

@Component({
  selector: 'app-bom-view-page',
  standalone: true,
  imports: [BomDemoPanels],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styles: [demoStyles],
  template: `
    <main class="bom-view-demo" data-testid="bom-view-demo">
      <h1>BOM 编辑与展开</h1>
      <p>按明确评估日浏览已发布结构，并在合法的草稿边界编辑发生项。</p>
      <div class="bom-demo-controls">
        <label
          >目标<select
            [disabled]="busy()"
            [value]="root()"
            (change)="setRoot($event)"
            aria-label="目标"
            name="bom-root"
          >
            @for (value of roots; track value) {
              <option [value]="value">{{ value }}</option>
            }
          </select></label
        >
        <label
          >评估日<input
            [disabled]="busy()"
            [value]="date()"
            (input)="date.set(value($event))"
            name="bom-date"
            step="0.001"
            type="datetime-local"
        /></label>
        <label
          >计划量<input
            [disabled]="busy()"
            [value]="planned()"
            (input)="planned.set(value($event))"
            inputmode="decimal"
            name="bom-planned"
            type="text"
        /></label>
        <label
          >深度预算<input
            [disabled]="busy()"
            [value]="depth()"
            (input)="depth.set(value($event))"
            inputmode="numeric"
            name="bom-depth"
            type="text"
        /></label>
      </div>
      <p>评估日和生效期均使用 UTC。</p>
      <div class="bom-demo-actions">
        <button [disabled]="!enabled() || published().pending" (click)="publish('pending')">发布新增ECN</button>
        <button [disabled]="!enabled() || published().quantity" (click)="publish('quantity')">改量ECN</button>
        <button [disabled]="!enabled() || published().revision" (click)="publish('revision')">发布phantom修订</button>
        <button [disabled]="!enabled()" (click)="convert()">修改换算率</button>
        <button [disabled]="!enabled()" (click)="publishDraft()">发布草稿</button>
        <button [disabled]="!enabled()" (click)="edit('draft')">草稿编辑</button>
        <button [disabled]="!enabled()" (click)="edit('pending')">ECN新行编辑</button>
        <button [disabled]="!enabled()" (click)="edit('repeat1')">已发布行编辑</button>
        <button [disabled]="!enabled()" (click)="calculate()">计算数量</button>
        <button [disabled]="!enabled()" (click)="rollup()">计算成本</button>
        <button [disabled]="!enabled()" (click)="exportBom()">导出BOM</button>
        <button [disabled]="!enabled()" (click)="attemptCycle()">尝试成环</button>
        <button [disabled]="!enabled()" (click)="refresh()">刷新</button>
        <button [disabled]="!session() || !mounted() || busy()" (click)="mounted.set(false)">卸载视图</button>
        <button [disabled]="!session() || mounted() || busy()" (click)="mounted.set(true)">重新挂载</button>
      </div>
      <p data-testid="bom-demo-status" role="status">{{ message() }}</p>
      @if (error() !== null) {
        <pre data-testid="bom-demo-error" role="alert">{{ errorText(error()) }}</pre>
      }
      @if (mounted()) {
        @if (session(); as session) {
          @if (input(); as input) {
            <app-bom-demo-panels [db]="session.db" [query]="input" (viewChange)="binding.set($event)" />
          }
        }
      }
    </main>
  `
})
export default class BomViewPage {
  readonly roots = roots;
  readonly session = signal<BomDemoSession | null>(null);
  readonly root = signal<BomViewFixtureRoot>(initialRoot());
  readonly date = signal(BOM_VIEW_FIXTURE_DATES.evaluation.slice(0, 16));
  readonly planned = signal('1');
  readonly depth = signal('');
  readonly message = signal('正在连接 BOM 数据库');
  readonly error = signal<unknown>(null);
  readonly busy = signal(false);
  readonly mounted = signal(true);
  readonly published = signal({ pending: false, quantity: false, revision: false });
  readonly binding = signal<BomViewBinding | null>(null);
  readonly errorText = bomErrorText;
  readonly enabled = computed(() => this.session() !== null && this.mounted() && !this.busy());
  readonly input = computed(
    () =>
      this.session()?.fixture.inputFor(this.root(), {
        context: { asOfDate: new Date(`${this.date()}Z`) },
        plannedQty: { value: this.planned(), uom: 'pcs' },
        budgets: this.depth() === '' ? undefined : { depth: Number(this.depth()) }
      }) ?? null
  );

  constructor() {
    const db = createDatabase();
    let active = true;
    let api: BomDemoApi | null = null;
    let shutdown: Promise<void> | null = null;
    const release = (): Promise<void> => {
      shutdown ??= db.destroy();
      return shutdown;
    };
    const target = window as Window & { __bomViewDemo?: BomDemoApi };
    const ready = (async () => {
      await db.connect('wa-sqlite');
      if (!active) return;
      const fixture = await loadBomViewFixture(db);
      if (!active) return;
      this.session.set({ db, fixture });
      this.message.set('BOM 数据已就绪');
      const binding = this.binding;
      api = {
        ids: fixture.ids,
        get state() {
          return binding()?.state() ?? null;
        }
      };
      target.__bomViewDemo = api;
    })().catch(async failure => {
      if (active) this.error.set(failure);
      await release();
    });
    inject(DestroyRef).onDestroy(() => {
      active = false;
      if (target.__bomViewDemo === api) delete target.__bomViewDemo;
      void ready.then(release);
    });
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  setRoot(event: Event): void {
    this.root.set(this.value(event) as BomViewFixtureRoot);
  }

  async publish(kind: 'pending' | 'quantity' | 'revision'): Promise<void> {
    const labels = { pending: '新增 ECN 已发布', quantity: '改量 ECN 已发布', revision: 'phantom 修订已发布' };
    await this.run(labels[kind], async () => {
      const fixture = this.currentSession().fixture;
      if (kind === 'pending') await fixture.actions.publishPendingEcn();
      if (kind === 'quantity') await fixture.actions.publishQuantityEcn('9', 'shared1');
      if (kind === 'revision') await fixture.actions.publishAssemblyRevision({ phantom: true });
      this.published.update(current => ({ ...current, [kind]: true }));
    });
  }

  async convert(): Promise<void> {
    await this.run('换算率已更新', () => this.currentSession().fixture.actions.setConversion('4'));
  }

  async publishDraft(): Promise<void> {
    await this.run('草稿已发布', () => this.currentSession().fixture.actions.publishDraft());
  }

  async edit(kind: 'draft' | 'pending' | 'repeat1'): Promise<void> {
    const labels = { draft: '草稿已加载', pending: 'ECN 新行已加载', repeat1: '已发布行已加载' };
    await this.run(labels[kind], () =>
      this.currentView().commands.loadOccurrence(this.currentSession().fixture.ids.occurrences[kind])
    );
  }

  async calculate(): Promise<void> {
    await this.run('数量已计算', () => this.currentView().commands.calculate());
  }

  async rollup(): Promise<void> {
    await this.run('成本已计算', () => {
      const input = this.currentInput();
      return this.currentSession().db.bom.rollupCost(
        { ...input.context, currency: 'CNY', rateDate: input.context.asOfDate },
        input.target
      );
    });
  }

  async exportBom(): Promise<void> {
    await this.run('BOM 已导出', () => {
      const input = this.currentInput();
      return this.currentSession().db.bom.exportBom(input.context, input.target, {
        plannedQty: input.plannedQty,
        budgets: input.budgets,
        params: input.params
      });
    });
  }

  async attemptCycle(): Promise<void> {
    await this.run('成环检查已完成', () => this.currentSession().fixture.actions.createCycleOccurrence());
  }

  refresh(): void {
    this.currentView().commands.refresh();
  }

  private currentSession(): BomDemoSession {
    const session = this.session();
    if (session === null) throw new Error('BOM 数据尚未就绪');
    return session;
  }

  private currentView(): BomViewBinding {
    const view = this.binding();
    if (view === null) throw new Error('BOM 视图尚未就绪或已经卸载');
    return view;
  }

  private currentInput(): BomViewInput {
    const input = this.input();
    if (input === null) throw new Error('BOM 输入尚未就绪');
    return input;
  }

  private async run(label: string, action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      this.message.set(label);
    } catch (failure) {
      this.error.set(failure);
    } finally {
      this.busy.set(false);
    }
  }
}
