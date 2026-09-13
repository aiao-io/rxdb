import { WaSqliteClient } from '@aiao/rxdb-adapter-wa-sqlite';
import { expose } from 'comlink';
import { resolveWaSqliteWorkerRole } from './wa-sqlite-worker-role';

/**
 * wa-sqlite 的 worker 入口（dedicated 与 shared 两种上下文共用）。
 *
 * @remarks
 * 这里只有一份入口，不是两份（`wa-sqlite.worker.ts` 专 worker、`wa-sqlite-shared.worker.ts`
 * 专 SharedWorker），是因为 Angular 的 esbuild worker 管线把两个 worker 入口合在一个构建里
 * 时，会给它们共享的模块（`WaSqliteClient`）拆一个共享 chunk，而那份 chunk **不会落进产物**
 * —— 两个 worker 文件开头都 `import "./chunk-XXXX.js"` 而那个文件不存在，worker 一加载就
 * 挂，manifest 上只有一句 404。合并成单入口之后没有第二个入口可分拆，chunk 自然消失。
 * 两个 VFS 档各自按自己的方式构造这份脚本：`new Worker(...)` 与 `new SharedWorker(...)`
 * 指向同一个文件，入口先判定自己的上下文角色（见 `wa-sqlite-worker-role.ts`）再接线。
 */
const client = new WaSqliteClient();

if (resolveWaSqliteWorkerRole(globalThis) === 'shared') {
  // shared 上下文：每个连接端口各 expose 一次；client 是同一单例，多次 expose 不复制状态。
  const scope = self as unknown as SharedWorkerGlobalScope;
  scope.onconnect = (event: MessageEvent) => expose(client, event.ports[0]);
} else {
  expose(client);
}
