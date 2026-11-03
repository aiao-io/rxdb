import { GitWorkbenchError } from './git-protocol.js';

export const GIT_WORKBENCH_ROOT = 'aiao-browser-workbench/projects';

export function assertProjectId(projectId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(projectId))
    throw new GitWorkbenchError('invalid_path', 'Invalid project identifier');
}

export function assertGitPath(path: string, internal = false): void {
  const segments = path.split('/');
  if (
    !path ||
    path.length > 240 ||
    path.includes('\\') ||
    [...path].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    throw new GitWorkbenchError('invalid_path', `Invalid file path: ${path}`);
  if (
    segments.some(
      segment => !segment || segment === '.' || segment === '..' || segment.startsWith('-') || /[ .]$/.test(segment)
    )
  )
    throw new GitWorkbenchError('invalid_path', `Non-canonical file path: ${path}`);
  if (
    segments.some(segment => segment.toLowerCase() === '.git') &&
    !(internal && segments[0] === '.git' && segments.slice(1).every(segment => segment.toLowerCase() !== '.git'))
  )
    throw new GitWorkbenchError('invalid_path', `Git metadata cannot be edited: ${path}`);
}

export function assertNoPathCollisions(paths: readonly string[], filePaths = paths): void {
  const entries = new Map<string, string>();
  for (const path of paths) {
    const segments = path.split('/');
    for (let index = 0; index < segments.length; index += 1) {
      const current = segments.slice(0, index + 1).join('/');
      const key = current.toLocaleLowerCase('en-US');
      const previous = entries.get(key);
      if (previous && previous !== current)
        throw new GitWorkbenchError('path_collision', `Case collision: ${previous} / ${current}`);
      entries.set(key, current);
    }
  }
  const files = new Set(filePaths);
  for (const path of filePaths) {
    const segments = path.split('/');
    if (segments.slice(0, -1).some((_, index) => files.has(segments.slice(0, index + 1).join('/'))))
      throw new GitWorkbenchError('path_collision', `File blocks directory: ${path}`);
  }
}

/** 工作台按文件暂存，不能让文件名里的通配符选择其他文件。 */
export function literalGitPathspec(path: string): string {
  return path.replace(/[*?[\]\\]/g, '\\$&');
}
