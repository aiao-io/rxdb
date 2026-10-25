import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, SqliteRepository, type WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { BOM_ENTITIES, bomErrorText, rxDBPluginBom, type BomViewInput } from '@aiao/rxdb-plugin-bom';
import { BomLineEditor, BomTree, useBomView, type BomViewBinding } from '@aiao/rxdb-plugin-bom-react';
import {
  BOM_VIEW_FIXTURE_DATES,
  loadBomViewFixture,
  type BomViewFixture,
  type BomViewFixtureRoot
} from '@aiao/rxdb-plugin-bom/testing';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import wasmUrl from 'wa-sqlite/dist/wa-sqlite-async.wasm?url';

interface BomDemoSession {
  db: RxDB;
  fixture: BomViewFixture;
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
    dbName: `bom-r-${crypto.randomUUID()}`,
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
        wasmPath: wasmUrl,
        batchTimeout: 1,
        repositories: { BomRepository: SqliteRepository } as unknown as WaSqliteOptions['repositories']
      })
  );
  return db;
};

function BomDemoPanels({
  db,
  input,
  onView
}: {
  db: RxDB;
  input: BomViewInput;
  onView(view: BomViewBinding | null): void;
}): ReactElement {
  const { state, commands } = useBomView(db, input);
  useLayoutEffect(() => {
    onView({ state, commands });
  }, [state, commands, onView]);
  useLayoutEffect(() => () => onView(null), [onView]);
  return (
    <div className='bom-demo-panels'>
      <BomTree state={state} commands={commands} />
      <BomLineEditor state={state} commands={commands} />
    </div>
  );
}

export default function BomViewPage(): ReactElement {
  const [session, setSession] = useState<BomDemoSession | null>(null);
  const [root, setRoot] = useState<BomViewFixtureRoot>(initialRoot);
  const [date, setDate] = useState(BOM_VIEW_FIXTURE_DATES.evaluation.slice(0, 16));
  const [planned, setPlanned] = useState('1');
  const [depth, setDepth] = useState('');
  const [parameters, setParameters] = useState({ date, planned, depth });
  useEffect(() => {
    const timer = setTimeout(() => setParameters({ date, planned, depth }), 40);
    return () => clearTimeout(timer);
  }, [date, planned, depth]);
  const [message, setMessage] = useState('正在连接 BOM 数据库');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [published, setPublished] = useState({ pending: false, quantity: false, revision: false });
  const binding = useRef<BomViewBinding | null>(null);
  const onView = useCallback((view: BomViewBinding | null): void => {
    binding.current = view;
  }, []);
  const input = useMemo(
    () =>
      session?.fixture.inputFor(root, {
        context: { asOfDate: new Date(`${parameters.date}Z`) },
        plannedQty: { value: parameters.planned, uom: 'pcs' },
        budgets: parameters.depth === '' ? undefined : { depth: Number(parameters.depth) }
      }) ?? null,
    [session, root, parameters]
  );
  useEffect(() => {
    const db = createDatabase();
    let active = true;
    let shutdown: Promise<void> | null = null;
    const release = (): Promise<void> => {
      shutdown ??= db.destroy();
      return shutdown;
    };
    const ready = (async () => {
      await db.connect('wa-sqlite');
      if (!active) return;
      const fixture = await loadBomViewFixture(db);
      if (!active) return;
      setSession({ db, fixture });
      setMessage('BOM 数据已就绪');
    })().catch(async failure => {
      if (active) setError(failure);
      await release();
    });
    return () => {
      active = false;
      void ready.then(release);
    };
  }, []);
  useEffect(() => {
    if (session === null) return;
    const api = {
      ids: session.fixture.ids,
      get state() {
        return binding.current?.state ?? null;
      }
    };
    const target = window as Window & { __bomViewDemo?: typeof api };
    target.__bomViewDemo = api;
    return () => {
      if (target.__bomViewDemo === api) delete target.__bomViewDemo;
    };
  }, [session]);
  const view = (): BomViewBinding => {
    if (binding.current === null) throw new Error('BOM 视图尚未就绪或已经卸载');
    return binding.current;
  };
  const run = async (label: string, action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMessage(label);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };
  const publish = async (kind: keyof typeof published): Promise<void> => {
    if (session === null) throw new Error('BOM 数据尚未就绪');
    if (kind === 'pending') await session.fixture.actions.publishPendingEcn();
    if (kind === 'quantity') await session.fixture.actions.publishQuantityEcn('9', 'shared1');
    if (kind === 'revision') await session.fixture.actions.publishAssemblyRevision({ phantom: true });
    setPublished(current => ({ ...current, [kind]: true }));
  };
  const enabled = session !== null && mounted && !busy;
  return (
    <main className='bom-view-demo' data-testid='bom-view-demo'>
      <style>{demoStyles}</style>
      <h1>BOM 编辑与展开</h1>
      <p>按明确评估日浏览已发布结构，并在合法的草稿边界编辑发生项。</p>
      <div className='bom-demo-controls'>
        <label>
          目标
          <select
            aria-label='目标'
            name='bom-root'
            value={root}
            disabled={busy}
            onChange={event => setRoot(event.currentTarget.value as BomViewFixtureRoot)}
          >
            {roots.map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          评估日
          <input
            name='bom-date'
            type='datetime-local'
            step='0.001'
            value={date}
            disabled={busy}
            onChange={event => setDate(event.currentTarget.value)}
          />
        </label>
        <label>
          计划量
          <input
            name='bom-planned'
            type='text'
            inputMode='decimal'
            value={planned}
            disabled={busy}
            onChange={event => setPlanned(event.currentTarget.value)}
          />
        </label>
        <label>
          深度预算
          <input
            name='bom-depth'
            type='text'
            inputMode='numeric'
            value={depth}
            disabled={busy}
            onChange={event => setDepth(event.currentTarget.value)}
          />
        </label>
      </div>
      <p>评估日和生效期均使用 UTC。</p>
      <div className='bom-demo-actions'>
        <button
          disabled={!enabled || published.pending}
          onClick={() => void run('新增 ECN 已发布', () => publish('pending'))}
        >
          发布新增ECN
        </button>
        <button
          disabled={!enabled || published.quantity}
          onClick={() => void run('改量 ECN 已发布', () => publish('quantity'))}
        >
          改量ECN
        </button>
        <button
          disabled={!enabled || published.revision}
          onClick={() => void run('phantom 修订已发布', () => publish('revision'))}
        >
          发布phantom修订
        </button>
        <button
          disabled={!enabled}
          onClick={() => void run('换算率已更新', async () => session!.fixture.actions.setConversion('4'))}
        >
          修改换算率
        </button>
        <button
          disabled={!enabled}
          onClick={() => void run('草稿已发布', () => session!.fixture.actions.publishDraft())}
        >
          发布草稿
        </button>
        <button
          disabled={!enabled}
          onClick={() =>
            void run('草稿已加载', () => view().commands.loadOccurrence(session!.fixture.ids.occurrences.draft))
          }
        >
          草稿编辑
        </button>
        <button
          disabled={!enabled}
          onClick={() =>
            void run('ECN 新行已加载', () => view().commands.loadOccurrence(session!.fixture.ids.occurrences.pending))
          }
        >
          ECN新行编辑
        </button>
        <button
          disabled={!enabled}
          onClick={() =>
            void run('已发布行已加载', () => view().commands.loadOccurrence(session!.fixture.ids.occurrences.repeat1))
          }
        >
          已发布行编辑
        </button>
        <button disabled={!enabled} onClick={() => void run('数量已计算', () => view().commands.calculate())}>
          计算数量
        </button>
        <button
          disabled={!enabled}
          onClick={() =>
            void run('成本已计算', async () =>
              session!.db.bom.rollupCost(
                { ...input!.context, currency: 'CNY', rateDate: input!.context.asOfDate },
                input!.target
              )
            )
          }
        >
          计算成本
        </button>
        <button
          disabled={!enabled}
          onClick={() =>
            void run('BOM 已导出', async () =>
              session!.db.bom.exportBom(input!.context, input!.target, {
                plannedQty: input!.plannedQty,
                budgets: input!.budgets,
                params: input!.params
              })
            )
          }
        >
          导出BOM
        </button>
        <button
          disabled={!enabled}
          onClick={() => void run('成环检查已完成', () => session!.fixture.actions.createCycleOccurrence())}
        >
          尝试成环
        </button>
        <button disabled={!enabled} onClick={() => view().commands.refresh()}>
          刷新
        </button>
        <button disabled={!session || !mounted || busy} onClick={() => setMounted(false)}>
          卸载视图
        </button>
        <button disabled={!session || mounted || busy} onClick={() => setMounted(true)}>
          重新挂载
        </button>
      </div>
      <p role='status' data-testid='bom-demo-status'>
        {message}
      </p>
      {error !== null && (
        <pre role='alert' data-testid='bom-demo-error'>
          {bomErrorText(error)}
        </pre>
      )}
      {session !== null && input !== null && mounted && <BomDemoPanels db={session.db} input={input} onView={onView} />}
    </main>
  );
}
