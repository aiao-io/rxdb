// ⚠️ 临时诊断代码（不提交）：把 renderer 的面包屑 / console / 未捕获错误经由一个
// 只写 stderr 的 Rust 命令送出来。release 包没有 devtools，这是唯一能看见页面内部的通道。
import { invoke } from '@tauri-apps/api/core';

const describe = (value: unknown): string => {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

export const probe = (message: string): void => {
  void invoke('dev_probe', { msg: message }).catch(() => undefined);
};

export const installProbe = (): void => {
  for (const level of ['log', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]): void => {
      probe(`console.${level} ${args.map(describe).join(' ')}`);
      original(...(args as []));
    };
  }
  window.addEventListener('error', event => {
    probe(`window.error ${event.message} @ ${event.filename}:${event.lineno}`);
  });
  window.addEventListener('unhandledrejection', event => {
    probe(`unhandledrejection ${describe(event.reason)}`);
  });
  // 心跳：JS 主线程一旦停摆（被 WebKit 挂起 / 阻塞），stderr 上就会出现一个明确的断点。
  let beat = 0;
  setInterval(() => {
    beat += 1;
    probe(`heartbeat ${String(beat)} t=${String(Math.round(performance.now()))}ms vis=${document.visibilityState}`);
  }, 2_000);
};
