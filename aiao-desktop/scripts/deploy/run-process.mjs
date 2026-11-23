import { spawn } from 'node:child_process';

/** 转给子进程组的信号：发布者在终端按 Ctrl-C（或 Nx 收尾）时，上传要跟着停。 */
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM'];

const describeDuration = milliseconds =>
  milliseconds >= 1000 ? `${Math.round(milliseconds / 1000)} 秒` : `${milliseconds} 毫秒`;

/** 向子进程所在的整个进程组发信号；子进程没起来（没有 pid）或已经退出（ESRCH）都不算错。 */
function signalGroup(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

/**
 * 跑一个子进程并等它结束；超过 `timeoutMs` 就终止它，并以明确的信息失败。仅支持 POSIX（发布在发布者的 macOS 本机跑）。
 *
 * - **终止整个进程组**：`pnpm dlx wrangler` 会再拉起 node 与 wrangler，只结束最外层会留下孤儿继续上传，
 *   而失败之后它还可能在线上产生一个部署。所以子进程自己做组长（`detached`），超时先发 SIGTERM，
 *   `killGraceMs` 之后还没退出就 SIGKILL，确认子进程结束之后才返回失败。
 * - **转发信号**：独立进程组收不到终端的 Ctrl-C，所以收到 SIGINT / SIGTERM 时转给它，等它退出后以「被信号终止」失败；
 *   父进程自己要退出（例如别处抛了未捕获的错误）时也终止它，不留下继续上传的孤儿（SIGKILL 拦不住，这是 POSIX 的限制）。
 *
 * @param command 命令
 * @param args 参数
 * @param options.cwd 工作目录
 * @param options.env 完整的环境变量
 * @param options.capture 为真时返回 stdout（stderr 仍原样显示），否则 stdout 也原样显示
 * @param options.label 失败信息里怎么称呼这条命令
 * @param options.timeoutMs 时限（毫秒，必须是正数）；超过就终止
 * @param options.killGraceMs SIGTERM 之后等多久还没退出就 SIGKILL
 * @param options.failureHint 命令失败（非零退出）的信息后面补充的提示
 * @param options.timeoutHint 超时的信息后面补充的提示
 * @param options.signalSource 提供 SIGINT / SIGTERM 的事件源，默认当前进程；测试注入替身
 * @returns stdout（`capture` 时），否则空字符串
 */
export function runProcess(
  command,
  args,
  {
    cwd,
    env,
    capture = false,
    label,
    timeoutMs,
    killGraceMs = 5000,
    failureHint = '',
    timeoutHint = '',
    signalSource = process
  }
) {
  return new Promise((resolve, reject) => {
    // 缺省或 0 会让定时器立刻触发，子进程一启动就被终止，所以不当作「不限时」
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs 必须是正数毫秒');
    const child = spawn(command, args, {
      cwd,
      env,
      detached: true,
      stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit']
    });
    let stdout = '';
    let timedOut = false;
    let killTimer;
    child.stdout?.on('data', chunk => (stdout += chunk));

    const forwarders = [
      ...FORWARDED_SIGNALS.map(signal => [signal, () => signalGroup(child, signal)]),
      ['exit', () => signalGroup(child, 'SIGTERM')]
    ];
    for (const [signal, forward] of forwarders) signalSource.on(signal, forward);
    const timer = setTimeout(() => {
      timedOut = true;
      signalGroup(child, 'SIGTERM');
      killTimer = setTimeout(() => signalGroup(child, 'SIGKILL'), killGraceMs);
    }, timeoutMs);
    const settle = () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      for (const [signal, forward] of forwarders) signalSource.off(signal, forward);
    };

    child.once('error', error => {
      settle();
      reject(error);
    });
    child.once('close', (code, signal) => {
      settle();
      if (timedOut) {
        reject(new Error(`${label} 超过 ${describeDuration(timeoutMs)}仍未结束，已终止它的进程${timeoutHint}`));
      } else if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${label} 失败（${signal ? `被信号 ${signal} 终止` : `退出码 ${code}`}）${failureHint}`));
      }
    });
  });
}
