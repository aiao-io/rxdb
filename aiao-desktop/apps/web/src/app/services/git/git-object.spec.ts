import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { GitObjectFilesystem, parseGitTree, readLooseObject } from './git-object.js';

const encoder = new TextEncoder();

function loose(kind: string, content: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const header = encoder.encode(`${kind} ${content.length}\0`);
  const joined = new Uint8Array(header.length + content.length);
  joined.set(header);
  joined.set(content, header.length);
  return new Uint8Array(deflateSync(joined));
}

function filesystem(nodes: Record<string, Uint8Array<ArrayBuffer>>): GitObjectFilesystem {
  const map = new Map(Object.entries(nodes));
  return {
    readFile: path => {
      const node = map.get(path);
      if (!node) throw new Error(`ENOENT: ${path}`);
      return new Uint8Array(node);
    },
    readdir: () => [],
    analyzePath: path => ({ exists: map.has(path) })
  };
}

describe('readLooseObject', () => {
  const root = '/opfs/repo';
  const oid = 'ab'.repeat(20);

  it('解压并剥离头部，返回对象类型与原始内容', async () => {
    const content = encoder.encode('hello blob');
    const fs = filesystem({ [`${root}/.git/objects/ab/${'ab'.repeat(19)}`]: loose('blob', content) });
    const object = await readLooseObject(fs, root, oid);
    expect(object).toEqual({ kind: 'blob', bytes: content });
  });

  it('二进制 blob（含 0 字节与高位字节）逐字节保真', async () => {
    const content = new Uint8Array([0, 255, 10, 13, 0, 128, 7]);
    const fs = filesystem({ [`${root}/.git/objects/ab/${'ab'.repeat(19)}`]: loose('blob', content) });
    const object = await readLooseObject(fs, root, oid);
    expect(object.kind).toBe('blob');
    expect(object.bytes).toEqual(content);
  });

  it('对象缺失时报错（调用方据此回退 cat-file）', async () => {
    await expect(readLooseObject(filesystem({}), root, oid)).rejects.toMatchObject({ code: 'git_failed' });
  });

  it('畸形对象（无头部终止符、未知类型）被拒绝', async () => {
    const malformed = filesystem({
      [`${root}/.git/objects/ab/${'ab'.repeat(19)}`]: new Uint8Array(deflateSync(encoder.encode('blob 5no-nul')))
    });
    await expect(readLooseObject(malformed, root, oid)).rejects.toMatchObject({ code: 'git_failed' });
    const unsupported = filesystem({
      [`${root}/.git/objects/ab/${'ab'.repeat(19)}`]: loose('tag', encoder.encode('x'))
    });
    await expect(readLooseObject(unsupported, root, oid)).rejects.toMatchObject({ code: 'git_failed' });
  });
});

describe('parseGitTree', () => {
  function tree(entries: [string, string, string][]): Uint8Array<ArrayBuffer> {
    const raw = (hexText: string): Uint8Array<ArrayBuffer> =>
      Uint8Array.from({ length: 20 }, (_, index) => parseInt(hexText.slice(index * 2, index * 2 + 2), 16));
    const parts: Uint8Array<ArrayBuffer>[] = [];
    for (const [mode, name, oidHex] of entries) {
      const head = encoder.encode(`${mode} ${name}\0`);
      const sha = raw(oidHex);
      const joined = new Uint8Array(head.length + sha.length);
      joined.set(head);
      joined.set(sha, head.length);
      parts.push(joined);
    }
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  it('解析子树与 blob 条目及其 oid', () => {
    const entries = parseGitTree(
      tree([
        ['40000', 'nested', 'cd'.repeat(20)],
        ['100644', 'main.ts', 'ef'.repeat(20)]
      ])
    );
    expect(entries).toEqual([
      { mode: '40000', kind: 'tree', oid: 'cd'.repeat(20), name: 'nested' },
      { mode: '100644', kind: 'blob', oid: 'ef'.repeat(20), name: 'main.ts' }
    ]);
  });

  it('空树与截断条目按预期处理', () => {
    expect(parseGitTree(new Uint8Array())).toEqual([]);
    expect(() => parseGitTree(encoder.encode('100644 main.ts'))).toThrow(/malformed|truncated/);
  });
});
