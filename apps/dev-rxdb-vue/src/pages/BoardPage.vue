<script setup lang="ts">
import { onBeforeUnmount, ref, toRaw } from 'vue';
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { BoardView } from '@aiao/rxdb-plugin-board-vue';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { firstValueFrom } from 'rxjs';

/**
 * 看板页（US-531 阶段 A 宿主半边）：独立 RxDB 实例——
 * sqlite-wasm 主线程 `vfs: 'idb'`、独立库名、看板实体在 `board` 命名空间，
 * 进入本页才创建连接，不复用宿主的 provideRxDB。
 */
const rxdb = ref<RxDB | null>(null);
const error = ref<string | null>(null);

const db = new RxDB({
  dbName: 'aiao-board',
  entities: [Board, Column, Task, BoardLabel, TaskLabel],
  sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
});
db.use(rxDBPluginHistory);
db.use(rxDBPluginSearch);
db.adapter('sqlite-wasm', () => new RxDBAdapterSqlite(db, { vfs: 'idb' }));
void db
  .connect('sqlite-wasm')
  .then(() => {
    // 组件可能已卸载（路由切换），此时不更新 ref
    rxdb.value = db;
  })
  .catch((cause: unknown) => {
    error.value = cause instanceof Error ? cause.message : String(cause);
  });

onBeforeUnmount(() => {
  void db.disconnectAll().catch(() => undefined);
});

const exportBackup = async (): Promise<void> => {
  const current = rxdb.value;
  if (!current) return;
  const adapter = await firstValueFrom(current.localAdapter$);
  const chunks: Uint8Array[] = [];
  await adapter.backup(
    new WritableStream<Uint8Array>({
      write: chunk => void chunks.push(chunk)
    })
  );
  const blob = new Blob(chunks);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `board-backup-${current.config.dbName}.rxdb`;
  anchor.click();
  URL.revokeObjectURL(url);
};

// Vue 会把 props 包成 reactive 代理，类实例必须取回原始对象（与绑定包同款 toRaw 语义）
const rawRxdb = (): RxDB | null => (rxdb.value ? toRaw(rxdb.value) : null);
</script>

<template>
  <p
    v-if="error"
    class="board-connecting"
    data-testid="board-connecting"
    >看板数据库连接失败：{{ error }}</p
  >
  <p
    v-else-if="!rxdb"
    class="board-connecting"
    data-testid="board-connecting"
    >正在连接看板数据库…</p
  >
  <BoardView
    v-else
    :rxdb="rawRxdb()!"
    :on-export-backup="exportBackup"
  />
</template>

<style scoped>
.board-connecting {
  padding: 2rem;
  color: var(--text-secondary, #666);
}
</style>
