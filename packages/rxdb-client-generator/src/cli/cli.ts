#!/usr/bin/env node

/**
 * @fileoverview RxDB Client Generator CLI
 * 命令行工具入口，读取配置文件并执行代码生成
 *
 * @module rxdb-client-generator/cli
 */

import { createJiti } from 'jiti';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import buildClientLibrary from './build-client-lib.js';
import type { RxDBClientCLIentGeneratorOptions } from './cli.interface.js';
import { validateUniqueConfigOutDirs } from './out-dir.js';

export type { RxDBClientCLIentGeneratorOptions } from './cli.interface.js';

const jiti = createJiti(import.meta.url, {
  fsCache: false,
  moduleCache: false
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const normalizeConfig = (value: unknown, configDir: string, configIndex: number): RxDBClientCLIentGeneratorOptions => {
  if (!isRecord(value)) {
    throw new Error(`Config entry ${configIndex} must be an object`);
  }

  const { allowEmpty, entities, outDir, relationQueryDeep, splitFiles } = value;
  if (!Array.isArray(entities) || !entities.every(entity => typeof entity === 'string')) {
    throw new Error(`Config entry ${configIndex} entities must be a string array`);
  }
  if (typeof outDir !== 'string') {
    throw new Error(`Config entry ${configIndex} outDir must be a string`);
  }
  if (relationQueryDeep !== undefined && (!Number.isInteger(relationQueryDeep) || (relationQueryDeep as number) < 1)) {
    throw new Error(`Config entry ${configIndex} relationQueryDeep must be an integer >= 1`);
  }
  if (splitFiles !== undefined && typeof splitFiles !== 'boolean') {
    throw new Error(`Config entry ${configIndex} splitFiles must be a boolean`);
  }
  // 不校验的话 `allowEmpty: 'no'` 这类写法会因为字符串真值绕过 fail-closed（RCG-003）
  if (allowEmpty !== undefined && typeof allowEmpty !== 'boolean') {
    throw new Error(`Config entry ${configIndex} allowEmpty must be a boolean`);
  }

  return {
    ...value,
    allowEmpty: allowEmpty as boolean | undefined,
    entities: entities.map(entity => normalize(resolve(configDir, entity))),
    outDir: normalize(resolve(configDir, outDir)),
    relationQueryDeep: relationQueryDeep as number | undefined,
    splitFiles: splitFiles as boolean | undefined
  };
};

/** 加载可执行的 CLI 配置，并将其路径解析为相对于配置文件的路径。 */
export async function loadConfig(configPath: string): Promise<RxDBClientCLIentGeneratorOptions[]> {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const absoluteConfigPath = resolve(configPath);
  const configDir = dirname(absoluteConfigPath);
  const configModule = (await jiti.import(absoluteConfigPath)) as Record<string, unknown>;
  const config =
    configModule.default ?? configModule.config ?? configModule.rxdbConfig ?? Object.values(configModule)[0];

  if (config === undefined || config === null) {
    throw new Error('No valid config export found');
  }

  const configs = Array.isArray(config) ? config : [config];
  if (configs.length === 0) {
    throw new Error('Config file contains an empty array');
  }

  const normalized = configs.map((entry, index) => normalizeConfig(entry, configDir, index));
  validateUniqueConfigOutDirs(normalized);
  return normalized;
}

/** 执行 CLI。 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: rxdb-client-generator <config-file>');
    process.exit(1);
  }

  const configs = await loadConfig(args[0]);
  await Promise.all(configs.map(config => buildClientLibrary(config)));
  console.log(`✅ Generated ${configs.length} client(s) from ${args[0]}`);
}

/**
 * 比较两条 file URL 是否指向同一 CLI 入口。
 *
 * 必须先 `fileURLToPath` 再比真实路径：Windows 上 `import.meta.url` 可能是
 * `file:///d:/...`、`file:///D%3A/...`、`file://localhost/D:/...`，
 * 只比 URL pathname 会漏掉编码和反斜杠形态。
 */
export const sameCliFileUrl = (left: string, right: string): boolean => {
  try {
    return comparableCliPath(left) === comparableCliPath(right);
  } catch {
    return left === right;
  }
};

const comparableCliPath = (fileUrl: string): string => {
  const url = new URL(fileUrl);
  if (url.protocol !== 'file:') return fileUrl;
  // POSIX 上 fileURLToPath('file:///D:/...') 得到 `/D:/...`；Windows 上是 `D:\...`。
  return fileURLToPath(url)
    .replaceAll('\\', '/')
    .replace(/^\/?([A-Za-z]):/u, (_match, letter: string) => `${letter.toLowerCase()}:`);
};

/**
 * 判断本模块是否作为 CLI 入口被直接执行。
 *
 * @remarks
 * `realpathSync` 不可省：npm 的 `node_modules/.bin/*` 是软链，`process.argv[1]` 拿到的是
 * 软链路径，而 ESM 加载器给 `import.meta.url` 的是解链后的真实路径。不解链则两者永不相等，
 * 经 npm bin 调用时 CLI 什么都不做、以 0 退出。
 */
export const isCliEntry = (importMetaUrl: string, argvEntry: string | undefined): boolean => {
  if (argvEntry === undefined) return false;
  const entryPath = resolve(argvEntry);
  if (!existsSync(entryPath)) return false;
  return sameCliFileUrl(importMetaUrl, pathToFileURL(realpathSync(entryPath)).href);
};

if (isCliEntry(import.meta.url, process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
