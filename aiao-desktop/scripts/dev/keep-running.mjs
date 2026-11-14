/**
 * Nx 的持续任务提前退出会被当成服务停了。没有子进程要守着时，挂一个定时器保持运行，收到停止信号再退出。
 */
export function keepRunning() {
  const timer = setInterval(() => undefined, 60_000);
  const stop = () => clearInterval(timer);
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
