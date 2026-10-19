export const GIT_BENCHMARK_PROFILES = Object.freeze({ small: 100, medium: 1_000, large: 3_000 });

const FILE_BYTES = 4_096;
const PATCH_COUNT = 10;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';

const createTextGenerator = index => {
  let state = (0x6d2b79f5 ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  return length => {
    let result = '';
    for (let position = 0; position < length; position++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      result += ALPHABET[(state >>> 0) % ALPHABET.length];
    }
    return result;
  };
};

const sourcePath = index => {
  const packageId = String(Math.floor(index / 100)).padStart(2, '0');
  const featureId = String(Math.floor(index / 10) % 10).padStart(2, '0');
  const moduleId = String(index).padStart(6, '0');
  return `src/package-${packageId}/feature-${featureId}/module-${moduleId}.ts`;
};

const sourceContent = (index, revision) => {
  const text = createTextGenerator(index);
  let content = `export const moduleId = ${index};\nexport const revision = ${revision};\n`;
  for (let line = 0; line < 48; line++) {
    content += `export const value${String(line).padStart(2, '0')} = '${text(48)}';\n`;
  }
  return `${content}// ${text(FILE_BYTES - content.length - 4)}\n`;
};

const commitIdentity = timestamp => ({
  name: 'Git Benchmark',
  email: 'git-benchmark@example.invalid',
  timestamp,
  timezoneOffset: 0
});

const commitOptions = (message, timestamp) => ({
  message,
  author: commitIdentity(timestamp),
  committer: commitIdentity(timestamp)
});

export const createGitBenchmarkFixture = (profile = 'small') => {
  if (!Object.hasOwn(GIT_BENCHMARK_PROFILES, profile)) {
    throw new Error(`unknown Git benchmark profile: ${String(profile)}`);
  }
  const fileCount = GIT_BENCHMARK_PROFILES[profile];
  const files = Array.from({ length: fileCount }, (_, index) => ({
    path: sourcePath(index),
    content: sourceContent(index, 0)
  }));
  const patch = Array.from({ length: PATCH_COUNT }, (_, patchIndex) => {
    const index = Math.floor((patchIndex * fileCount) / PATCH_COUNT);
    return { path: sourcePath(index), content: sourceContent(index, 1) };
  });
  return {
    profile,
    fileCount,
    fileBytes: FILE_BYTES,
    totalBytes: fileCount * FILE_BYTES,
    files,
    patch,
    initialCommit: commitOptions('benchmark initial tree', 1_700_000_000),
    modifiedCommit: commitOptions('benchmark modify ten files', 1_700_000_001)
  };
};

export const summarizeDurations = samples => {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('Git benchmark durations must be a non-empty array');
  }
  if (!Array.from(samples).every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
    throw new Error('Git benchmark durations must contain finite non-negative numbers');
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 1 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
  const p95Index = Math.ceil(sorted.length * 0.95) - 1;
  return {
    samples: sorted.length,
    medianMs,
    p95Ms: sorted[p95Index],
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    p95Method: 'nearest-rank',
    p95Note:
      p95Index === sorted.length - 1 ?
        `${sorted.length} 次采样的最近秩 p95 等于最大样本，不能作为稳定尾延迟估计。`
      : `最近秩 p95 取升序第 ${p95Index + 1} / ${sorted.length} 个样本。`
  };
};
