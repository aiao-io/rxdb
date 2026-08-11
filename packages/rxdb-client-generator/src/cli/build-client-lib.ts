/**
 * @fileoverview RxDB Client 生成库构建器
 * 核心构建逻辑：分析实体文件、生成代码、写入输出目录
 *
 * @module rxdb-client-generator/cli/build-client-lib
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import analyzeFile, { createAnalysisProject } from './analyze-file.js';
import type { RxDBClientCLIentGeneratorOptions } from './cli.interface.js';
import findFiles from './find-files.js';

const MANIFEST_FILE_NAME = '.rxdb-client-generator-manifest.json';
const STAGING_DIR_PREFIX = '.rxdb-client-generator-staging-';

interface OutputManifest {
  version: 1;
  files: string[];
}

interface OutputFile {
  fullPath: string;
  manifestPath: string;
  text: string;
}

const outputQueues = new Map<string, Promise<void>>();

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const resolveOutputFile = (outDir: string, filePath: string): Omit<OutputFile, 'text'> => {
  const fullPath = resolve(outDir, filePath);
  const relativePath = relative(outDir, fullPath);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Generated path escapes output directory: ${filePath}`);
  }
  return {
    fullPath,
    manifestPath: relativePath.split(sep).join('/')
  };
};

/**
 * 从 outDir 起逐级判断某个相对路径上是否存在软链（RCG-004）
 *
 * `resolveOutputFile` 只做词法 `relative()` 判断 —— 词法上留在目录内的路径，
 * 物理上可能穿过软链落到外面。写入侧因为改成 rename 已经不会写穿
 * （rename 替换链接本身），但**删除侧**的 `rmSync(outDir/linked/x.js)` 会
 * 顺着软链目录删掉真正的外部文件。
 */
const hasSymlinkComponent = (outDir: string, manifestPath: string): boolean => {
  let current = outDir;
  for (const segment of manifestPath.split('/')) {
    current = resolve(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        return true;
      }
    } catch {
      // 该层不存在就没有链接可跟随，后续层级同理
      return false;
    }
  }
  return false;
};

const readManifest = (outDir: string): OutputManifest => {
  const manifestPath = resolve(outDir, MANIFEST_FILE_NAME);
  if (!existsSync(manifestPath)) {
    return { version: 1, files: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid generator manifest: ${manifestPath}`, { cause: error });
  }

  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.files) ||
    !parsed.files.every(file => typeof file === 'string')
  ) {
    throw new Error(`Invalid generator manifest: ${manifestPath}`);
  }

  const files = parsed.files.map(file => resolveOutputFile(outDir, file).manifestPath);
  if (new Set(files).size !== files.length) {
    throw new Error(`Generator manifest contains duplicate files: ${manifestPath}`);
  }
  return { version: 1, files };
};

/**
 * 写出生成结果，分三段：内存校验 → staging 落盘 → 提交（RCG-005）
 *
 * 原实现是「边检测边写」：大小写碰撞的 throw 发生在**前序文件已被覆盖之后**，
 * 中途任何 I/O 错误都会留下「一半新一半旧」且 manifest 还指向旧集合的输出目录。
 *
 * 三段之后，**校验类失败对输出目录零副作用**（连 outDir 都不会被创建）。
 * 残留风险：提交段（逐个 rename）本身不是一个事务 —— 确定性的失败原因
 * （路径逃逸、大小写碰撞、目标是已存在目录）都在第一段挡掉了，
 * 但权限、磁盘满、外部并发改动仍可能让提交做到一半。
 * 进程被 SIGKILL 也会残留 staging 目录（不主动清理：跨进程并发时
 * 无法区分「上次崩溃的残留」和「另一个进程正在用的」）。
 */
const writeOutputs = (outDir: string, outputs: OutputFile[]): void => {
  const previousManifest = readManifest(outDir);
  const currentFiles = new Set<string>();
  // macOS/Windows 文件系统大小写不敏感：Index.js 与 index.js 是同一个文件。
  // 精确大小写的 Set 检测不出覆盖，陈旧文件清理还会把刚写好的那个删掉。
  const currentKeys = new Set<string>();

  // ── 第一段：全部校验跑完，一个字节都不写 ──
  for (const output of outputs) {
    const key = output.manifestPath.toLowerCase();
    if (currentKeys.has(key)) {
      throw new Error(`Generator produced colliding output: ${output.manifestPath}`);
    }
    // 目标已是目录时 writeFileSync/renameSync 必然失败。放到这里拒绝，
    // 提交段就不会因为这个确定性原因走到一半。
    if (existsSync(output.fullPath) && lstatSync(output.fullPath).isDirectory()) {
      throw new Error(`Generated path is an existing directory: ${output.manifestPath}`);
    }
    currentKeys.add(key);
    currentFiles.add(output.manifestPath);
  }

  // 陈旧文件的删除路径同样在这里校验：放到提交段才发现就已经写了一半（RCG-004 / RCG-005）
  const staleFiles = previousManifest.files.filter(staleFile => !currentKeys.has(staleFile.toLowerCase()));
  for (const staleFile of staleFiles) {
    if (hasSymlinkComponent(outDir, staleFile)) {
      throw new Error(
        `Refusing to remove a stale output through a symlink: ${staleFile}. ` +
          `Delete ${MANIFEST_FILE_NAME} to reset the generated file set.`
      );
    }
  }

  const manifest: OutputManifest = {
    version: 1,
    files: [...currentFiles].sort()
  };

  // ── 第二段：写进 staging。必须建在 outDir 内，跨设备 rename 会失败 ──
  mkdirSync(outDir, { recursive: true });
  const stagingDir = mkdtempSync(resolve(outDir, STAGING_DIR_PREFIX));
  try {
    for (const output of outputs) {
      const stagedPath = resolve(stagingDir, output.manifestPath);
      mkdirSync(dirname(stagedPath), { recursive: true });
      writeFileSync(stagedPath, output.text, 'utf8');
    }
    const stagedManifest = resolve(stagingDir, MANIFEST_FILE_NAME);
    writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    // ── 第三段：提交。逐个 rename 各自原子，manifest 最后换 ──
    for (const output of outputs) {
      mkdirSync(dirname(output.fullPath), { recursive: true });
      renameSync(resolve(stagingDir, output.manifestPath), output.fullPath);
    }

    for (const staleFile of staleFiles) {
      rmSync(resolveOutputFile(outDir, staleFile).fullPath, { force: true });
    }

    renameSync(stagedManifest, resolve(outDir, MANIFEST_FILE_NAME));
  } finally {
    rmSync(stagingDir, { force: true, recursive: true });
  }
};

const buildOnce = async (options: RxDBClientCLIentGeneratorOptions): Promise<void> => {
  const { entities, outDir: configuredOutDir, allowEmpty = false, ...generatorOptions } = options;
  const outDir = resolve(configuredOutDir);

  // 三道 fail-closed 断言（RCG-003）。零实体的构建会按上次 manifest 删掉全部产物，
  // 而 glob 拼错、装饰器被误删都表现为零实体 —— 必须在写入之前拦住。
  if (!allowEmpty && entities.length === 0) {
    throw new Error(
      'No entity patterns configured: `entities` is empty. Set `allowEmpty` to generate an empty client.'
    );
  }

  const files = await findFiles(entities, { allowEmpty });
  const project = createAnalysisProject(files);
  const generator = new RxDBClientGenerator(generatorOptions);

  for (const file of files) {
    for (const { extendMetadataOptions, metadataOptions, sourceGetters } of analyzeFile(file, project)) {
      generator.addEntity(metadataOptions, extendMetadataOptions, sourceGetters);
    }
  }

  if (!allowEmpty && generator.metadataSet.size === 0) {
    throw new Error(
      `No entities found in ${files.length} analyzed file(s). Set \`allowEmpty\` to generate an empty client.`
    );
  }

  generator.exec();
  const outputs = generator
    .getSourceFiles()
    .map(sourceFile => ({
      ...resolveOutputFile(outDir, sourceFile.getFilePath()),
      text: sourceFile.getText()
    }))
    .sort((left, right) => left.manifestPath.localeCompare(right.manifestPath));
  writeOutputs(outDir, outputs);
};

/**
 * 队列键必须是**物理**目录
 *
 * 词法路径下，指向同一物理目录的两个软链别名会得到两个队列，
 * 串行化随之失效，两条构建互相删除对方的产物（RCG-004）。
 */
const resolveQueueKey = (outDir: string): string => {
  const absolute = resolve(outDir);
  try {
    return realpathSync(absolute);
  } catch {
    // 首次生成时目录还不存在，此时也不存在别名问题
    return absolute;
  }
};

/** 生成客户端文件，并按输出目录串行化并发构建。 */
const buildClientLibrary = (options: RxDBClientCLIentGeneratorOptions): Promise<void> => {
  const queueKey = resolveQueueKey(options.outDir);
  const previous = outputQueues.get(queueKey) ?? Promise.resolve();
  let release: () => void;
  const next = new Promise<void>(resolveQueue => {
    release = resolveQueue;
  });
  outputQueues.set(queueKey, next);

  return previous.then(async () => {
    try {
      await buildOnce(options);
    } finally {
      release();
      if (outputQueues.get(queueKey) === next) {
        outputQueues.delete(queueKey);
      }
    }
  });
};

export default buildClientLibrary;
