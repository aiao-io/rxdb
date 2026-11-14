import { describe, expect, it } from 'vitest';
import { assertSupportedGitIndex } from './git-index.js';

function indexFixture(mode = 0o100644, flags = 0): Uint8Array<ArrayBuffer> {
  const path = new TextEncoder().encode('src/main.ts');
  const length = Math.ceil((62 + path.length + 1) / 8) * 8;
  const result = new Uint8Array(12 + length + 20);
  const view = new DataView(result.buffer);
  view.setUint32(0, 0x44495243);
  view.setUint32(4, 2);
  view.setUint32(8, 1);
  view.setUint32(12 + 24, mode);
  view.setUint16(12 + 60, flags | path.length);
  result.set(path, 12 + 62);
  return result;
}

describe('Git index capability validation', () => {
  it('accepts normal file entries without touching their original bytes', () => {
    const index = indexFixture();
    const original = new Uint8Array(index);
    expect(() => assertSupportedGitIndex(index)).not.toThrow();
    expect(index).toEqual(original);
  });
  it.each([0o100755, 0o120000, 0o160000, 0o040000])('rejects unsupported Git entry mode %d', mode =>
    expect(() => assertSupportedGitIndex(indexFixture(mode))).toThrow()
  );
  it('rejects conflicted entries, wrong headers, truncated names and unsupported index versions', () => {
    expect(() => assertSupportedGitIndex(indexFixture(0o100644, 0x1000))).toThrow();
    expect(() => assertSupportedGitIndex(new Uint8Array(3))).toThrow();
    const version = indexFixture();
    new DataView(version.buffer).setUint32(4, 4);
    expect(() => assertSupportedGitIndex(version)).toThrow(/version/i);
    const truncated = indexFixture().slice(0, 40);
    expect(() => assertSupportedGitIndex(truncated)).toThrow(/truncated/i);
    const missingTerminator = indexFixture();
    missingTerminator.fill(65, 74, missingTerminator.length - 20);
    expect(() => assertSupportedGitIndex(missingTerminator)).toThrow(/filename/i);
  });
  it('rejects external split-index extensions', () => {
    const source = indexFixture();
    const result = new Uint8Array(source.length + 8);
    result.set(source.subarray(0, -20));
    result.set(new TextEncoder().encode('link'), source.length - 20);
    expect(() => assertSupportedGitIndex(result)).toThrow(/split/i);
  });
});
