import { GitWorkbenchError, type GitStatusEntry } from './git-protocol.js';

/** 用 index 的完整文件名唯一定位重命名目标，歧义时拒绝猜测。 */
export function parseGitStatus(raw: string, indexPaths: readonly string[] = []): readonly GitStatusEntry[] {
  const entries = raw.split('\n').filter(line => /^[ MADRCUT?!]{2} /.test(line)).map(line => ({ index: line[0], worktree: line[1], path: line.slice(3) }));
  return entries.map(entry => {
    if (entry.index !== 'R' && entry.index !== 'C') return entry;
    const candidates = indexPaths.filter(path => entry.path.length > path.length + 1 && entry.path.endsWith(` ${path}`));
    if (candidates.length !== 1) throw new GitWorkbenchError('git_failed', `Ambiguous staged rename path: ${entry.path}`);
    return { ...entry, path: candidates[0] };
  });
}
