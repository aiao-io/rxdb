/**
 * 本机 `supabase/edge-runtime` 的事件 worker（Deno）：把用户 worker 的启动、关闭与未捕获异常事件逐行打印成 `EDGE_EVENT <JSON>`。
 * 关闭事件带这个 worker 用掉的 CPU 时间（`cpu_time_used`，毫秒）、关闭原因（CPUTime / Memory / WallClockTime / EarlyDrop 等）
 * 与内存（`memory_used`），资源测量脚本按行读取容器日志；日志事件太多，不打印。
 */
interface RuntimeEvent {
  event_type: string;
  event: unknown;
  metadata: unknown;
}
declare const EventManager: new () => AsyncIterable<RuntimeEvent>;

for await (const data of new EventManager()) {
  if (data.event_type !== 'Log') console.log(`EDGE_EVENT ${JSON.stringify(data)}`);
}
