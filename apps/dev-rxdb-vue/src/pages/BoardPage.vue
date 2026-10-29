<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from 'vue';
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { BoardView } from '@aiao/rxdb-plugin-board-vue';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { getE2eDbName } from '@aiao/rxdb-test';
import { firstValueFrom } from 'rxjs';

/**
 * 看板页（US-539 阶段 A 宿主半边）：独立 RxDB 实例——
 * sqlite-wasm 主线程 `vfs: 'idb'`、独立库名、看板实体在 `board` 命名空间，
 * 进入本页才创建连接，不复用宿主的 provideRxDB。
 */
// 类实例必须走 shallowRef：ref 的 UnwrapRef 会把 RxDB 剥成结构类型（丢 #private），
// 与绑定组件的 RxDB prop 类型对不上；运行时也不再需要 toRaw 取回原始对象。
const rxdb = shallowRef<RxDB | null>(null);
const error = ref<string | null>(null);
const seedError = ref<string | null>(null);

const db = new RxDB({
  dbName: getE2eDbName('aiao-board'),
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
  const adapter = (await firstValueFrom(current.localAdapter$)) as unknown as {
    backup(sink: WritableStream<Uint8Array>): Promise<unknown>;
  };
  const chunks: Uint8Array[] = [];
  await adapter.backup(
    new WritableStream<Uint8Array>({
      write: chunk => void chunks.push(chunk)
    })
  );
  const blob = new Blob(chunks as BlobPart[]);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `board-backup-${current.config.dbName}.rxdb`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // 点击触发的下载对 blob URL 的读取是异步的，立即回收会让部分浏览器中断下载或拿到空文件
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** 装载演示数据：只装进空库（种子固定 ID，不向已有库追加）。 */
const seedDemo = async (): Promise<void> => {
  const current = rxdb.value;
  if (!current) return;
  try {
    const boards = await firstValueFrom(
      current.entityManager.getRepository(Board).count({ where: { combinator: 'and', rules: [] } })
    );
    if (boards > 0) {
      seedError.value = '演示数据只能装进空库';
      return;
    }
    await seedReleaseBoardDataset(current);
    seedError.value = null;
  } catch (cause) {
    seedError.value = cause instanceof Error ? cause.message : String(cause);
  }
};
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
  <template v-else>
    <BoardView
      :rxdb="rxdb!"
      :on-export-backup="exportBackup"
    />
    <footer
      class="board-tools"
      data-testid="board-tools"
    >
      <button
        type="button"
        data-testid="seed-demo"
        @click="seedDemo"
        >装载演示数据</button
      >
    </footer>
    <p
      v-if="seedError"
      class="board-notice"
      role="alert"
      data-testid="board-notice-host"
      >{{ seedError }}</p
    >
  </template>
</template>

<style scoped>
.board-connecting {
  padding: 2rem;
  color: var(--text-secondary, #666);
}
.board-tools {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0.5rem 1rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}
.board-notice {
  color: #b91c1c;
  padding: 0.25rem 1rem;
}
</style>
