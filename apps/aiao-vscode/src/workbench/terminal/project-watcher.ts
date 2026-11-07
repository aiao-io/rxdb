/** 监听脚本每行事件的前缀，把事件和 `[Vivari] …` 之类的其他输出分开。 */
export const WATCH_EVENT = 'aiao-watch:';

/** 监听用到的 Node fs 子集。 */
export interface WatcherFs {
  watch(
    path: string,
    listener: (kind: string, name: string | null) => void
  ): { close(): void; on(event: 'error', listener: (error: unknown) => void): unknown };
  readdirSync(path: string, options: { withFileTypes: true }): readonly { name: string; isDirectory(): boolean }[];
}

/**
 * 在 VM 里逐目录监听项目，跳过忽略的目录，把变化（相对项目根的路径）交给 emit。
 *
 * 不用 `fs.watch(root, { recursive: true })`：它会扫遍 node_modules，安装时撞上一闪而过的临时文件
 * （`lstat` 报 ENOENT）就让整个进程崩掉。目录在注册前后消失（ENOENT / ENOTDIR）是正常情况。
 * 整个函数会被序列化进 `node -e` 脚本，只能用参数，不能引用模块里的其他东西。
 */
export function watchProject(
  fs: WatcherFs,
  root: string,
  ignored: readonly string[],
  emit: (kind: string, file: string) => void
): void {
  const skip = new Set(ignored);
  const watchers = new Map<string, { close(): void }>();
  const join = (directory: string, name: string): string => (directory ? `${directory}/${name}` : name);
  const gone = (error: unknown): boolean => {
    const code = (error as { code?: unknown } | null)?.code;
    return code === 'ENOENT' || code === 'ENOTDIR';
  };
  const forget = (directory: string): void => {
    for (const [key, watcher] of watchers) {
      if (key !== directory && !key.startsWith(`${directory}/`)) continue;
      watcher.close();
      watchers.delete(key);
    }
  };
  const track = (directory: string): void => {
    if (watchers.has(directory)) return;
    try {
      const watcher = fs.watch(directory ? `${root}/${directory}` : root, (kind, name) => {
        if (!name) return;
        const file = join(directory, String(name));
        emit(kind, file);
        // 出现或消失：是目录就重新监听，消失了就停掉它下面的监听
        if (kind !== 'rename' || skip.has(String(name))) return;
        forget(file);
        track(file);
      });
      watcher.on('error', () => forget(directory));
      watchers.set(directory, watcher);
      const entries = fs.readdirSync(directory ? `${root}/${directory}` : root, { withFileTypes: true });
      for (const entry of entries) if (entry.isDirectory() && !skip.has(entry.name)) track(join(directory, entry.name));
    } catch (error) {
      forget(directory);
      if (!gone(error)) throw error;
    }
  };
  track('');
}

/** 监听进程的 `node -e` 脚本：监听目录与忽略目录直接写进去（vivari 的 `node -e` 不把后续参数放进 argv）。 */
export const watchScript = (root: string, ignored: readonly string[]): string =>
  `(${watchProject.toString()})(require('fs'),${JSON.stringify(root)},${JSON.stringify(ignored)},(kind,file)=>process.stdout.write(${JSON.stringify(WATCH_EVENT)}+JSON.stringify([kind,file])+'\\n'))`;
