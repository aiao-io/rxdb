import { realpathSync } from 'node:fs';
import { basename, dirname, normalize, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import buildClientLibrary from '../cli/build-client-lib.js';
import type { RxDBClientCLIentGeneratorOptions } from '../cli/cli.interface.js';
import findFiles from '../cli/find-files.js';
import { validateUniqueConfigOutDirs } from '../cli/out-dir.js';

/**
 * Vite 插件配置。传入数组时每项必须拥有独立的物理 `outDir`。
 */
export type RxDBClientGeneratorVitePluginOptions =
  RxDBClientCLIentGeneratorOptions | RxDBClientCLIentGeneratorOptions[];

const WATCH_EVENTS = new Set(['add', 'change', 'unlink']);
const GLOB_MAGIC = /[*?[\]{}]/u;

const toPhysicalPath = (filePath: string): string => {
  const absolute = normalize(resolve(filePath));
  const suffix: string[] = [];
  let existingPath = absolute;

  while (true) {
    try {
      return normalize(resolve(realpathSync.native(existingPath), ...suffix.reverse()));
    } catch {
      const parent = dirname(existingPath);
      if (parent === existingPath) return absolute;
      suffix.push(basename(existingPath));
      existingPath = parent;
    }
  }
};

const getWatchRoot = (pattern: string): string => {
  const absolute = normalize(resolve(pattern));
  const magicIndex = absolute.search(GLOB_MAGIC);
  if (magicIndex === -1) return toPhysicalPath(absolute);
  const prefix = absolute.slice(0, magicIndex);
  const separatorIndex = prefix.lastIndexOf(sep);
  const watchRoot = separatorIndex === -1 ? normalize(resolve('.')) : prefix.slice(0, separatorIndex) || sep;
  return toPhysicalPath(watchRoot);
};

const resolveEntityFiles = async (config: RxDBClientCLIentGeneratorOptions): Promise<Set<string>> =>
  new Set((await findFiles(config.entities, { allowEmpty: true })).map(toPhysicalPath));

const toViteError = (error: unknown) => {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return {
    message: normalized.message,
    stack: normalized.stack ?? normalized.message,
    plugin: 'rxdb-client-generator-vite-plugin'
  };
};

/**
 * 创建 RxDB 客户端生成 Vite 插件。
 *
 * build 在模块解析前生成；dev server 启动时先生成，并在实体文件增删改后串行重建、触发 full reload。
 * 重复或软链别名 `outDir` 会在插件创建时 fail-fast。
 *
 * @param options 单个配置或多个互不拥有同一输出目录的配置
 * @returns Vite 插件实例
 * @throws {Error} 配置数组存在重复物理输出目录时抛出
 * @example
 * ```typescript
 * rxdbClientGeneratorVitePlugin({
 *   entities: ['./src/entities/*.ts'],
 *   outDir: './src/generated'
 * });
 * ```
 */
export function rxdbClientGeneratorVitePlugin(options: RxDBClientGeneratorVitePluginOptions): Plugin {
  const configs = Array.isArray(options) ? options : [options];
  validateUniqueConfigOutDirs(configs);
  let command: 'build' | 'serve' = 'build';
  const buildAll = async (): Promise<void> => {
    for (const config of configs) await buildClientLibrary(config);
  };

  return {
    name: 'rxdb-client-generator-vite-plugin',
    configResolved(config) {
      command = config.command;
    },
    async buildStart() {
      if (command === 'build') await buildAll();
    },
    async configureServer(server) {
      await buildAll();
      let filesByConfig = await Promise.all(configs.map(resolveEntityFiles));
      const pendingFiles = new Set<string>();
      let rebuildPromise: Promise<void> | undefined;

      const runPendingBuilds = async (): Promise<void> => {
        while (pendingFiles.size > 0) {
          const changedFiles = new Set(pendingFiles);
          pendingFiles.clear();
          const currentFilesByConfig = await Promise.all(configs.map(resolveEntityFiles));
          const affectedConfigs = configs.filter((_config, index) => {
            const previous = filesByConfig[index];
            const current = currentFilesByConfig[index];
            return [...changedFiles].some(file => previous.has(file) || current.has(file));
          });
          filesByConfig = currentFilesByConfig;
          if (affectedConfigs.length === 0) continue;
          for (const config of affectedConfigs) await buildClientLibrary(config);
          server.ws.send({ type: 'full-reload' });
        }
      };

      const scheduleBuild = (file: string): void => {
        pendingFiles.add(toPhysicalPath(file));
        if (rebuildPromise) return;
        rebuildPromise = Promise.resolve()
          .then(runPendingBuilds)
          .catch(error => {
            const viteError = toViteError(error);
            server.config.logger.error(`[rxdb-client-generator] ${viteError.message}`);
            server.ws.send({ type: 'error', err: viteError });
          })
          .finally(() => {
            rebuildPromise = undefined;
            if (pendingFiles.size > 0) scheduleBuild([...pendingFiles][0]);
          });
      };

      const onWatcherEvent = (event: string, file: string): void => {
        if (WATCH_EVENTS.has(event)) scheduleBuild(file);
      };
      server.watcher.add([...new Set(configs.flatMap(config => config.entities.map(getWatchRoot)))]);
      server.watcher.on('all', onWatcherEvent);
      server.httpServer?.once('close', () => server.watcher.off('all', onWatcherEvent));
    }
  };
}
