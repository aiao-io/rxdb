/**
 * 开发环境里常驻脚本的生命周期。Nx 以独立会话拉起 run-commands 的子进程，自己被 SIGKILL（工具超时、`kill -9`、崩溃）时
 * 来不及清理它们，固定端口会被孤儿进程占住，下一次 `nx dev` 就起不来。所以除了 SIGINT / SIGTERM，还要定时核对启动者：
 * 启动者一消失，进程就被系统收养（父进程号变了），这时同样停止。
 */
const STOP_SIGNALS = ['SIGINT', 'SIGTERM'];

/**
 * 保持运行，直到收到停止信号或启动者消失，然后调用一次 `stop`。轮询的定时器让没有其他任务的脚本也保持运行。
 *
 * @param {() => void} stop 停止时要做的事（关服务、关连接池）；只调用一次
 * @param {object} [options]
 * @param {Pick<NodeJS.EventEmitter, 'once' | 'off'>} [options.events] 接收停止信号的对象，默认 `process`
 * @param {number} [options.parent] 启动时的父进程号，默认 `process.ppid`
 * @param {() => number} [options.currentParent] 读当前父进程号，默认读 `process.ppid`
 * @param {number} [options.pollMs] 核对启动者的间隔
 * @returns {() => void} 主动停止
 */
export function untilStopped(
  stop,
  { events = process, parent = process.ppid, currentParent = () => process.ppid, pollMs = 1000 } = {}
) {
  let stopped = false;
  const finish = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    for (const signal of STOP_SIGNALS) events.off(signal, finish);
    stop();
  };
  const timer = setInterval(() => currentParent() !== parent && finish(), pollMs);
  for (const signal of STOP_SIGNALS) events.once(signal, finish);
  return finish;
}
