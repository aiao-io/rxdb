import type { ProjectTemplate } from './compiler/compiler-types.js';
import { decodeGitArchive } from './git/git-archive.js';

/** 在创建仓库前校验归档结构和受控模板，避免无效导入污染项目目录。 */
export function projectArchiveInfo(
  name: string,
  bytes: Uint8Array
): {
  name: string;
  template: ProjectTemplate;
  entry: string;
} {
  const archive = decodeGitArchive(new Uint8Array(bytes));
  const source = archive.files.find(file => file.path === 'workbench.project.json');
  if (!source) throw new Error('归档缺少受控模板配置');
  const config: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(source.bytes));
  if (!config || typeof config !== 'object') throw new Error('无效模板配置');
  const metadata = config as Record<string, unknown>;
  if (
    typeof metadata['template'] !== 'string' ||
    !['vanilla', 'react', 'vue', 'angular'].includes(metadata['template']) ||
    typeof metadata['entry'] !== 'string' ||
    !archive.files.some(file => file.path === metadata['entry'] && !file.path.startsWith('.git/'))
  )
    throw new Error('导入归档不属于受控模板');
  return {
    name: name.replace(/\.zip$/i, ''),
    template: metadata['template'] as ProjectTemplate,
    entry: metadata['entry']
  };
}
