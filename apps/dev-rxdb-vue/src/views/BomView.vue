<script setup lang="ts">
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, SqliteRepository, type WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { BOM_ENTITIES, bomErrorText, rxDBPluginBom, type BomViewInput } from '@aiao/rxdb-plugin-bom';
import { BomLineEditor, BomTree, useBomView, type BomViewBinding } from '@aiao/rxdb-plugin-bom-vue';
import {
  BOM_VIEW_FIXTURE_DATES,
  loadBomViewFixture,
  type BomViewFixture,
  type BomViewFixtureRoot
} from '@aiao/rxdb-plugin-bom/testing';
import { computed, effectScope, onMounted, onUnmounted, ref, shallowRef, watch, type EffectScope } from 'vue';
import wasmUrl from 'wa-sqlite/dist/wa-sqlite-async.wasm?url';

const evaluation = ref(BOM_VIEW_FIXTURE_DATES.evaluation.slice(0, 16));
const planned = ref('1');
const depth = ref('');
const binding = shallowRef<BomViewBinding | null>(null);
const busy = ref(false);
const message = ref('正在连接 BOM 数据库');
const error = shallowRef<unknown>(null);
const pendingPublished = ref(false);
const quantityPublished = ref(false);
const revisionPublished = ref(false);
const roots: BomViewFixtureRoot[] = [
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
const target = ref<BomViewFixtureRoot>(initialRoot());

let database: RxDB | null = null;
let fixture: BomViewFixture | null = null;
let scope: EffectScope | null = null;
let disposed = false;
let initialization: Promise<void> | undefined;
let shutdown: Promise<void> | undefined;
let demoApi: { ids: BomViewFixture['ids']; readonly state: BomViewBinding['state']['value'] | null } | undefined;
const release = (): Promise<void> => {
  if (!database) return Promise.resolve();
  shutdown ??= database.destroy();
  return shutdown;
};
const enabled = computed(() => binding.value !== null && !busy.value);
const canMountView = (): boolean => fixture !== null && binding.value === null && !busy.value;

const requireFixture = (): BomViewFixture => {
  if (!fixture) throw new Error('BOM 数据尚未就绪');
  return fixture;
};

const requireBinding = (): BomViewBinding => {
  if (!binding.value) throw new Error('BOM 视图尚未挂载');
  return binding.value;
};

const requireDatabase = (): RxDB => {
  if (!database) throw new Error('BOM 数据库尚未连接');
  return database;
};

const input = (): BomViewInput => {
  return requireFixture().inputFor(target.value, {
    context: { asOfDate: new Date(`${evaluation.value}Z`) },
    plannedQty: { value: planned.value, uom: 'pcs' },
    budgets: depth.value === '' ? undefined : { depth: Number(depth.value) }
  });
};

const mountView = (): void => {
  const db = database;
  if (!db || !fixture || disposed) return;
  scope?.stop();
  const currentScope = effectScope();
  scope = currentScope;
  binding.value = currentScope.run(() => useBomView(db, input())) ?? null;
};

const unmountView = (): void => {
  scope?.stop();
  scope = null;
  binding.value = null;
};

const run = async (label: string, action: () => Promise<unknown>): Promise<void> => {
  busy.value = true;
  error.value = null;
  try {
    await action();
    message.value = label;
  } catch (cause) {
    error.value = cause;
  } finally {
    busy.value = false;
  }
};

const publishPending = async (): Promise<void> => {
  await requireFixture().actions.publishPendingEcn();
  pendingPublished.value = true;
};

const publishQuantity = async (): Promise<void> => {
  await requireFixture().actions.publishQuantityEcn('9', 'shared1');
  quantityPublished.value = true;
};

const publishRevision = async (): Promise<void> => {
  await requireFixture().actions.publishAssemblyRevision({ phantom: true });
  revisionPublished.value = true;
};

const edit = (kind: 'draft' | 'pending' | 'repeat1'): Promise<void> =>
  requireBinding().commands.loadOccurrence(requireFixture().ids.occurrences[kind]);

const calculateCost = async (): Promise<void> => {
  const current = input();
  await requireDatabase().bom.rollupCost(
    {
      ...current.context,
      currency: 'CNY',
      rateDate: current.context.asOfDate
    },
    current.target
  );
};

const exportBom = async (): Promise<void> => {
  const current = input();
  await requireDatabase().bom.exportBom(current.context, current.target, {
    plannedQty: current.plannedQty,
    budgets: current.budgets,
    params: current.params
  });
};

watch([target, evaluation, planned, depth], () => binding.value?.commands.setInput(input()));

const initialize = async (): Promise<void> => {
  const db = new RxDB({
    dbName: `bom-v-${crypto.randomUUID()}`,
    entities: [...BOM_ENTITIES],
    sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
  });
  database = db;
  db.use(rxDBPluginBom);
  db.adapter(
    'wa-sqlite',
    owner =>
      new RxDBAdapterWaSqlite(owner, {
        vfs: 'MemoryAsyncVFS',
        async: true,
        worker: false,
        wasmPath: wasmUrl,
        batchTimeout: 1,
        repositories: { BomRepository: SqliteRepository } as unknown as WaSqliteOptions['repositories']
      })
  );
  await db.connect('wa-sqlite');
  if (disposed) return;
  fixture = await loadBomViewFixture(db);
  if (disposed) return;
  const api = {
    ids: fixture.ids,
    get state() {
      return binding.value?.state.value ?? null;
    }
  };
  demoApi = api;
  (window as Window & { __bomViewDemo?: typeof api }).__bomViewDemo = api;
  mountView();
  message.value = 'BOM 数据已就绪';
};

onMounted(() => {
  initialization = initialize().catch(async cause => {
    if (!disposed) error.value = cause;
    await release();
  });
});

onUnmounted(() => {
  disposed = true;
  unmountView();
  const targetWindow = window as Window & { __bomViewDemo?: unknown };
  if (targetWindow.__bomViewDemo === demoApi) delete targetWindow.__bomViewDemo;
  void initialization?.then(release);
});
</script>

<template>
  <main
    class="bom-view-demo"
    data-testid="bom-view-demo"
  >
    <h1>BOM 编辑与展开</h1>
    <p>按明确评估日浏览已发布结构，并在合法的草稿边界编辑发生项。</p>
    <div class="bom-demo-controls">
      <label
        >目标<select
          aria-label="目标"
          v-model="target"
          name="bom-root"
          :disabled="busy"
          ><option
            v-for="root in roots"
            :key="root"
            :value="root"
            >{{ root }}</option
          ></select
        ></label
      >
      <label
        >评估日<input
          v-model="evaluation"
          name="bom-date"
          type="datetime-local"
          step="0.001"
          :disabled="busy"
      /></label>
      <label
        >计划量<input
          v-model="planned"
          name="bom-planned"
          type="text"
          inputmode="decimal"
          :disabled="busy"
      /></label>
      <label
        >深度预算<input
          v-model="depth"
          name="bom-depth"
          type="text"
          inputmode="numeric"
          :disabled="busy"
      /></label>
    </div>
    <p>评估日和生效期均使用 UTC。</p>
    <div class="bom-demo-actions">
      <button
        :disabled="!enabled || pendingPublished"
        @click="run('新增 ECN 已发布', publishPending)"
        >发布新增ECN</button
      >
      <button
        :disabled="!enabled || quantityPublished"
        @click="run('改量 ECN 已发布', publishQuantity)"
        >改量ECN</button
      >
      <button
        :disabled="!enabled || revisionPublished"
        @click="run('phantom 修订已发布', publishRevision)"
        >发布phantom修订</button
      >
      <button
        :disabled="!enabled"
        @click="run('换算率已更新', () => requireFixture().actions.setConversion('4'))"
        >修改换算率</button
      >
      <button
        :disabled="!enabled"
        @click="run('草稿已发布', () => requireFixture().actions.publishDraft())"
        >发布草稿</button
      >
      <button
        :disabled="!enabled"
        @click="run('草稿已加载', () => edit('draft'))"
        >草稿编辑</button
      >
      <button
        :disabled="!enabled"
        @click="run('ECN 新行已加载', () => edit('pending'))"
        >ECN新行编辑</button
      >
      <button
        :disabled="!enabled"
        @click="run('已发布行已加载', () => edit('repeat1'))"
        >已发布行编辑</button
      >
      <button
        :disabled="!enabled"
        @click="run('数量已计算', () => requireBinding().commands.calculate())"
        >计算数量</button
      >
      <button
        :disabled="!enabled"
        @click="run('成本已计算', calculateCost)"
        >计算成本</button
      >
      <button
        :disabled="!enabled"
        @click="run('BOM 已导出', exportBom)"
        >导出BOM</button
      >
      <button
        :disabled="!enabled"
        @click="run('成环检查已完成', () => requireFixture().actions.createCycleOccurrence())"
        >尝试成环</button
      >
      <button
        :disabled="!enabled"
        @click="binding?.commands.refresh()"
        >刷新</button
      >
      <button
        :disabled="!binding || busy"
        @click="unmountView"
        >卸载视图</button
      >
      <button
        :disabled="!canMountView()"
        @click="mountView"
        >重新挂载</button
      >
    </div>
    <p
      role="status"
      data-testid="bom-demo-status"
      >{{ message }}</p
    >
    <pre
      v-if="error !== null"
      role="alert"
      data-testid="bom-demo-error"
      >{{ bomErrorText(error) }}</pre>
    <div
      v-if="binding"
      class="bom-demo-panels"
    >
      <BomTree
        :state="binding.state.value"
        :commands="binding.commands"
      />
      <BomLineEditor
        :state="binding.state.value"
        :commands="binding.commands"
      />
    </div>
  </main>
</template>

<style scoped>
.bom-view-demo {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  color: #172337;
  font:
    15px/1.5 system-ui,
    sans-serif;
}
h1 {
  margin: 0 0 12px;
  font-size: 28px;
  font-weight: 700;
}
.bom-demo-controls,
.bom-demo-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 16px 0;
}
.bom-demo-controls label {
  display: grid;
  gap: 4px;
}
button,
input,
select {
  border: 1px solid #718096;
  border-radius: 4px;
  padding: 6px 10px;
  background: #fff;
  color: #172337;
  font: inherit;
}
button:disabled {
  opacity: 0.65;
}
.bom-demo-panels {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
  gap: 16px;
}
[role='alert'] {
  color: #9b1c1c;
  white-space: pre-wrap;
}
@media (max-width: 720px) {
  .bom-demo-panels {
    grid-template-columns: 1fr;
  }
}
</style>
