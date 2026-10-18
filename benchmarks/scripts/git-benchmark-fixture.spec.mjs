import { describe, expect, it } from 'vitest';
import { createGitBenchmarkFixture, summarizeDurations } from './git-benchmark-fixture.mjs';

describe('createGitBenchmarkFixture', () => {
  it.each([
    ['small', 100],
    ['medium', 1_000],
    ['large', 3_000]
  ])('creates %s with unique nested source paths and exact byte sizes', (profile, fileCount) => {
    const fixture = createGitBenchmarkFixture(profile);

    expect(fixture.profile).toBe(profile);
    expect(fixture.fileCount).toBe(fileCount);
    expect(fixture.fileBytes).toBe(4_096);
    expect(fixture.totalBytes).toBe(fileCount * 4_096);
    expect(fixture.files).toHaveLength(fileCount);
    expect(new Set(fixture.files.map(file => file.path)).size).toBe(fileCount);
    expect(new Set(fixture.files.map(file => file.content)).size).toBe(fileCount);
    expect(fixture.files.every(file => /^src\/package-\d+\/feature-\d+\/module-\d+\.ts$/.test(file.path))).toBe(true);
    expect(fixture.files.every(file => [...file.content].every(character => character.charCodeAt(0) < 128))).toBe(true);
    expect(fixture.files.every(file => new TextEncoder().encode(file.content).byteLength === 4_096)).toBe(true);
    expect(fixture.files.every(file => file.content.endsWith('\n'))).toBe(true);
  });

  it('reproduces identical files, patches and commit identities across calls', () => {
    expect(createGitBenchmarkFixture()).toEqual(createGitBenchmarkFixture('small'));
  });

  it('uses the same source bytes when a profile grows', () => {
    const small = createGitBenchmarkFixture('small');
    const medium = createGitBenchmarkFixture('medium');

    expect(medium.files.slice(0, small.files.length)).toEqual(small.files);
  });

  it.each(['small', 'medium', 'large'])('patches exactly ten existing files across the %s tree', profile => {
    const fixture = createGitBenchmarkFixture(profile);
    const originals = new Map(fixture.files.map(file => [file.path, file.content]));
    const patchedIndexes = fixture.patch.map(file => fixture.files.findIndex(original => original.path === file.path));

    expect(fixture.patch).toHaveLength(10);
    expect(new Set(patchedIndexes).size).toBe(10);
    expect(Math.min(...patchedIndexes)).toBe(0);
    expect(Math.max(...patchedIndexes)).toBeGreaterThanOrEqual(fixture.fileCount * 0.9);
    for (const file of fixture.patch) {
      expect(originals.has(file.path)).toBe(true);
      expect(file.content).not.toBe(originals.get(file.path));
      expect(file.content).toContain('export const revision = 1;');
      expect(new TextEncoder().encode(file.content).byteLength).toBe(fixture.fileBytes);
    }
    expect(fixture.files.every(file => file.content.includes('export const revision = 0;'))).toBe(true);
  });

  it('fixes author, committer inputs and UTC timestamps for both commits', () => {
    const fixture = createGitBenchmarkFixture();

    expect(fixture.initialCommit.author).toEqual({
      name: 'Git Benchmark',
      email: 'git-benchmark@example.invalid',
      timestamp: 1_700_000_000,
      timezoneOffset: 0
    });
    expect(fixture.modifiedCommit.author).toEqual({
      ...fixture.initialCommit.author,
      timestamp: 1_700_000_001
    });
    expect(fixture.initialCommit.committer).toEqual(fixture.initialCommit.author);
    expect(fixture.modifiedCommit.committer).toEqual(fixture.modifiedCommit.author);
    expect(fixture.initialCommit.message).toBe('benchmark initial tree');
    expect(fixture.modifiedCommit.message).toBe('benchmark modify ten files');
  });

  it('does not share mutable fixture data between samples', () => {
    const first = createGitBenchmarkFixture();
    first.files[0].content = 'mutated';
    first.initialCommit.author.name = 'mutated';

    const second = createGitBenchmarkFixture();
    expect(second.files[0].content).not.toBe('mutated');
    expect(second.initialCommit.author.name).toBe('Git Benchmark');
  });

  it('rejects unknown profiles instead of silently changing the workload', () => {
    expect(() => createGitBenchmarkFixture('unknown')).toThrow('unknown Git benchmark profile');
    expect(() => createGitBenchmarkFixture('__proto__')).toThrow('unknown Git benchmark profile');
  });
});

describe('summarizeDurations', () => {
  it('uses the middle value and nearest-rank p95 without mutating the sample order', () => {
    const samples = [70, 10, 60, 20, 50, 30, 40];
    const summary = summarizeDurations(samples);

    expect(summary).toMatchObject({
      samples: 7,
      medianMs: 40,
      p95Ms: 70,
      minMs: 10,
      maxMs: 70,
      p95Method: 'nearest-rank'
    });
    expect(summary.p95Note).toContain('最大样本');
    expect(summary.p95Note).toContain('稳定');
    expect(samples).toEqual([70, 10, 60, 20, 50, 30, 40]);
  });

  it('averages the middle pair for an even sample count and permits zero durations', () => {
    expect(summarizeDurations([6, 0, 4, 2])).toMatchObject({ medianMs: 3, minMs: 0, maxMs: 6 });
    expect(summarizeDurations([0])).toMatchObject({ medianMs: 0, p95Ms: 0, samples: 1 });
  });

  it('does not report the maximum as p95 when the rank differs with more samples', () => {
    const samples = Array.from({ length: 100 }, (_, index) => index + 1);

    expect(summarizeDurations(samples)).toMatchObject({ medianMs: 50.5, p95Ms: 95, maxMs: 100 });
  });

  it.each([[], [NaN], [Infinity], [-Infinity], [-1], [1, '2']])('rejects invalid duration samples %j', samples => {
    expect(() => summarizeDurations(samples)).toThrow();
  });
});
