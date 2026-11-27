import { describe, expect, it } from 'vitest';
import { parseGitStatus } from './git-status.js';

describe('Git status rename records', () => {
  it('reads ordinary status paths literally', () => {
    expect(parseGitStatus(' M path with spaces.ts\n?? new.ts')).toEqual([
      { index: ' ', worktree: 'M', path: 'path with spaces.ts' },
      { index: '?', worktree: '?', path: 'new.ts' }
    ]);
  });

  it('gets the complete staged rename target from authoritative index filenames', () => {
    expect(parseGitStatus('RM old.ts new name -> final.ts', ['new name -> final.ts'])).toEqual([
      { index: 'R', worktree: 'M', path: 'new name -> final.ts', originalPath: 'old.ts' }
    ]);
  });

  it('rejects display-ambiguous suffixes instead of staging an arbitrary file', () => {
    expect(() => parseGitStatus('R  a b c', ['c', 'b c'])).toThrow(/ambiguous/i);
  });

  it('rejects incomplete or malformed rename records instead of inventing a stage path', () => {
    expect(() => parseGitStatus('R  old new')).toThrow(/rename/i);
    expect(() => parseGitStatus('R  old new', ['different-file'])).toThrow(/rename/i);
  });
});
