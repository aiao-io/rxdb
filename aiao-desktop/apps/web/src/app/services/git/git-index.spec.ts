import { describe, expect, it } from 'vitest';
import { assertSupportedGitIndex, parseGitIndex } from './git-index.js';

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

function withOid(index: Uint8Array<ArrayBuffer>, oidHex: string): Uint8Array<ArrayBuffer> {
  index.set(
    Uint8Array.from({ length: 20 }, (_, position) => parseInt(oidHex.slice(position * 2, position * 2 + 2), 16)),
    12 + 40
  );
  return index;
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

describe('parseGitIndex', () => {
  it('extracts entry paths and object ids without mutating the index', () => {
    const index = withOid(indexFixture(), 'ab'.repeat(20));
    const original = new Uint8Array(index);
    expect(parseGitIndex(index)).toEqual([{ path: 'src/main.ts', oid: 'ab'.repeat(20) }]);
    expect(index).toEqual(original);
  });

  it('walks multiple entries back to back', () => {
    const first = withOid(indexFixture(), '11'.repeat(20));
    const secondPath = new TextEncoder().encode('deep/nested.bin');
    const secondLength = Math.ceil((62 + secondPath.length + 1) / 8) * 8;
    const combined = new Uint8Array(first.length - 20 + secondLength + 20);
    combined.set(first.subarray(0, first.length - 20));
    const view = new DataView(combined.buffer);
    const second = first.length - 20;
    view.setUint32(4, 2);
    view.setUint32(8, 2);
    view.setUint32(second + 24, 0o100644);
    view.setUint16(second + 60, secondPath.length);
    combined.set(
      Uint8Array.from({ length: 20 }, (_, position) =>
        parseInt('22'.repeat(20).slice(position * 2, position * 2 + 2), 16)
      ),
      second + 40
    );
    combined.set(secondPath, second + 62);
    expect(parseGitIndex(combined)).toEqual([
      { path: 'src/main.ts', oid: '11'.repeat(20) },
      { path: 'deep/nested.bin', oid: '22'.repeat(20) }
    ]);
  });

  it('rejects malformed indexes with the validator guards', () => {
    expect(() => parseGitIndex(new Uint8Array(3))).toThrow();
    expect(() => parseGitIndex(indexFixture(0o120000))).toThrow(/Symlink/);
  });
});
