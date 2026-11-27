import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodeGitArchive, encodeGitArchive } from './git-archive.js';
import { assertGitPath, assertNoPathCollisions, assertProjectId } from './git-paths.js';
import { GIT_WORKBENCH_LIMITS } from './git-protocol.js';

const bytes = (value: string) => new TextEncoder().encode(value);
const baseFiles = {
  '.git/HEAD': strToU8('ref: refs/heads/main\n'),
  '.git/config': strToU8('[core]\n bare = false\n filemode = false\n')
};

describe('Git workspace paths', () => {
  it.each([
    '../a',
    '/a',
    'a//b',
    './a',
    'a/../b',
    'a\\b',
    '.git/config',
    'a/.GiT/config',
    '-n',
    'a\0b',
    'a\nb',
    'a ',
    'a.',
    ''
  ])('rejects non-canonical UI path %j', path => expect(() => assertGitPath(path)).toThrow());
  it.each(['Upper', '../other', 'a/b', '', 'a'.repeat(65)])('rejects invalid project identifier %j', project =>
    expect(() => assertProjectId(project)).toThrow()
  );
  it('accepts canonical nested files and rejects case or directory collisions', () => {
    expect(() => assertGitPath('src/component.tsx')).not.toThrow();
    expect(() => assertGitPath('.git/objects/ab/0123', true)).not.toThrow();
    expect(() => assertNoPathCollisions(['src/a.ts', 'Src/b.ts'])).toThrow();
    expect(() => assertNoPathCollisions(['src', 'src/a.ts'])).toThrow();
  });
});

describe('Git project ZIP boundary', () => {
  it('round-trips binary bytes and required Git empty directories', () => {
    const archive = {
      files: [
        ...Object.entries(baseFiles).map(([path, value]) => ({ path, bytes: value })),
        { path: 'asset.bin', bytes: new Uint8Array([0, 255, 128]) }
      ],
      directories: ['.git', '.git/objects', '.git/objects/pack']
    };
    expect(decodeGitArchive(encodeGitArchive(archive))).toEqual(archive);
  });
  it.each([
    '../escape',
    '/absolute',
    'src/../../escape',
    '.git/objects/info/alternates',
    '.git/hooks/pre-commit',
    '.git/worktrees/another/HEAD'
  ])('rejects archive escape or external Git path %s before persistence', path => {
    const archive = zipSync({ ...baseFiles, [path]: bytes('invalid') });
    expect(() => decodeGitArchive(archive)).toThrow();
  });
  it.each([
    '[include]\n path = /secret',
    '[includeIf "gitdir:other"]\n path = other',
    '[core]\n bare = true',
    '[core]\n worktree = ../../other',
    '[extensions]\n worktreeConfig = true'
  ])('rejects unsafe Git config %j', content => {
    expect(() => decodeGitArchive(zipSync({ ...baseFiles, '.git/config': bytes(content) }))).toThrow();
  });
  it('rejects symlinks, executable modes, duplicate case and missing Git metadata', () => {
    expect(() =>
      decodeGitArchive(zipSync({ ...baseFiles, link: [bytes('other'), { os: 3, attrs: 0o120777 << 16 }] }))
    ).toThrow();
    expect(() =>
      decodeGitArchive(zipSync({ ...baseFiles, script: [bytes('run'), { os: 3, attrs: 0o100755 << 16 }] }))
    ).toThrow();
    expect(() => decodeGitArchive(zipSync({ ...baseFiles, 'a.txt': bytes('a'), 'A.txt': bytes('A') }))).toThrow();
    expect(() => decodeGitArchive(zipSync({ 'a.txt': bytes('a') }))).toThrow();
  });
  it('rejects expanded oversize before decompressing a ZIP bomb', () => {
    const archive = zipSync({ ...baseFiles, huge: new Uint8Array(GIT_WORKBENCH_LIMITS.fileBytes + 1) });
    expect(() => decodeGitArchive(archive)).toThrow(/limit/i);
  });
  it('rejects invalid and truncated archive bytes', () => {
    expect(() => decodeGitArchive(new Uint8Array(3))).toThrow();
    expect(() => decodeGitArchive(new Uint8Array(30))).toThrow();
    expect(() => decodeGitArchive(zipSync(baseFiles).slice(0, -5))).toThrow();
  });
});
