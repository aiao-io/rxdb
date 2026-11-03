import type { ProjectTemplate } from './compiler/compiler-types.js';
import { decodeFileBytes } from './git/file-encoding.js';

/** 打开本地文件夹后的受控模板项目：文件快照与推断出的编译配置。 */
export interface ImportedFolderProject {
  readonly files: Record<string, string | Uint8Array>;
  readonly template: ProjectTemplate;
  readonly entry: string;
}

const MAX_FILES = 2000;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules']);
const ENTRY_CANDIDATES = [
  'src/main.ts',
  'src/main.js',
  'src/main.tsx',
  'src/main.jsx',
  'main.ts',
  'main.js',
  'src/index.ts',
  'src/index.js',
  'index.ts',
  'index.js'
] as const;
const PROJECT_CONFIG = 'workbench.project.json';
const TEMPLATES: readonly ProjectTemplate[] = ['vanilla', 'react', 'vue', 'angular'];

/** 从读取出的文件推断模板与入口；合法配置沿用，否则 vanilla + 入口候选。 */
export function inferFolderTemplate(files: Readonly<Record<string, string | Uint8Array>>): {
  template: ProjectTemplate;
  entry: string;
  configUsable: boolean;
} {
  const source = files[PROJECT_CONFIG];
  if (typeof source === 'string') {
    try {
      const parsed: unknown = JSON.parse(source);
      if (parsed && typeof parsed === 'object') {
        const config = parsed as Record<string, unknown>;
        if (
          typeof config['template'] === 'string' &&
          (TEMPLATES as readonly string[]).includes(config['template']) &&
          typeof config['entry'] === 'string' &&
          Object.hasOwn(files, config['entry'])
        )
          return { template: config['template'] as ProjectTemplate, entry: config['entry'], configUsable: true };
      }
    } catch {
      // 配置损坏时按无配置处理
    }
  }
  const entry = ENTRY_CANDIDATES.find(path => typeof files[path] === 'string') ?? 'src/main.ts';
  return { template: 'vanilla', entry, configUsable: false };
}

/** 递归读取目录为工作台文件快照；文本按 UTF-8 解码，二进制按字节保留，`.git` 与 `node_modules` 跳过。 */
export async function readFolderProject(handle: FileSystemDirectoryHandle): Promise<ImportedFolderProject> {
  const files: Record<string, string | Uint8Array> = {};
  let count = 0;
  let totalBytes = 0;
  const walk = async (directory: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
    for await (const [name, entry] of directory.entries()) {
      if (entry.kind === 'directory') {
        if (SKIPPED_DIRECTORIES.has(name)) continue;
        await walk(entry, `${prefix}${name}/`);
        continue;
      }
      count++;
      if (count > MAX_FILES) throw new Error(`文件夹文件数超过 ${MAX_FILES} 上限`);
      const file = await entry.getFile();
      totalBytes += file.size;
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error('文件夹内容超过 24 MiB 上限');
      const path = `${prefix}${name}`;
      files[path] = decodeFileBytes(path, new Uint8Array(await file.arrayBuffer()));
    }
  };
  await walk(handle, '');
  const inferred = inferFolderTemplate(files);
  if (!inferred.configUsable)
    files[PROJECT_CONFIG] = JSON.stringify({ template: inferred.template, entry: inferred.entry }, null, 2);
  return { files, template: inferred.template, entry: inferred.entry };
}
