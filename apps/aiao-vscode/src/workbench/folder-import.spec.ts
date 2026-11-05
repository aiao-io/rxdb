// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { inferFolderTemplate, readFolderProject } from './folder-import.js';

function fakeFile(name: string, content: string | Uint8Array, sizeOverride?: number): FileSystemFileHandle {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return {
    kind: 'file',
    name,
    getFile: async () => {
      const file = new File([new Uint8Array(bytes)], name);
      if (sizeOverride !== undefined) Object.defineProperty(file, 'size', { value: sizeOverride });
      return file;
    }
  } as unknown as FileSystemFileHandle;
}

function fakeDirectory(
  name: string,
  entries: Record<string, FileSystemDirectoryHandle | FileSystemFileHandle>
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    entries: async function* () {
      for (const [childName, handle] of Object.entries(entries))
        yield [childName, handle] as [string, FileSystemHandle];
    }
  } as unknown as FileSystemDirectoryHandle;
}

describe('打开本地文件夹', () => {
  it('无配置文件时按 vanilla 推断入口并补写配置', async () => {
    const project = await readFolderProject(
      fakeDirectory('plain', {
        'src/main.ts': fakeFile('main.ts', 'console.log(1)'),
        'README.md': fakeFile('README.md', '# hi')
      })
    );
    expect(project.template).toBe('vanilla');
    expect(project.entry).toBe('src/main.ts');
    expect(project.files['src/main.ts']).toBe('console.log(1)');
    expect(project.files['workbench.project.json']).toContain('"entry": "src/main.ts"');
  });

  it('入口候选依次命中，全部缺失时回退 src/main.ts', async () => {
    expect(
      (await readFolderProject(fakeDirectory('indexed', { 'index.ts': fakeFile('index.ts', 'export {}') }))).entry
    ).toBe('index.ts');
    const empty = await readFolderProject(fakeDirectory('empty', {}));
    expect(empty.entry).toBe('src/main.ts');
    expect(empty.files['workbench.project.json']).toContain('"template": "vanilla"');
  });

  it('合法配置文件沿用模板与入口且不被改写', async () => {
    const config = JSON.stringify({ template: 'react', entry: 'src/main.tsx' });
    const project = await readFolderProject(
      fakeDirectory('configured', {
        'workbench.project.json': fakeFile('workbench.project.json', config),
        'src/main.tsx': fakeFile('main.tsx', 'export default 1')
      })
    );
    expect(project.template).toBe('react');
    expect(project.entry).toBe('src/main.tsx');
    expect(project.files['workbench.project.json']).toBe(config);
  });

  it('非法配置（模板不在集合或入口不存在）视为缺失', async () => {
    const badTemplate = await readFolderProject(
      fakeDirectory('bad', {
        'workbench.project.json': fakeFile(
          'workbench.project.json',
          JSON.stringify({ template: 'svelte', entry: 'src/main.ts' })
        ),
        'src/main.ts': fakeFile('main.ts', 'export {}')
      })
    );
    expect(badTemplate.template).toBe('vanilla');
    expect(badTemplate.files['workbench.project.json']).toContain('"template": "vanilla"');
    const badEntry = await readFolderProject(
      fakeDirectory('bad-entry', {
        'workbench.project.json': fakeFile(
          'workbench.project.json',
          JSON.stringify({ template: 'vue', entry: 'src/missing.ts' })
        ),
        'src/main.ts': fakeFile('main.ts', 'export {}')
      })
    );
    expect(badEntry.template).toBe('vanilla');
    expect(badEntry.entry).toBe('src/main.ts');
  });

  it('递归读入嵌套目录，跳过 .git 与 node_modules，二进制按字节保留', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const project = await readFolderProject(
      fakeDirectory('app', {
        'src/components': fakeDirectory('components', { 'Button.tsx': fakeFile('Button.tsx', 'export {}') }),
        'assets/logo.png': fakeFile('logo.png', png),
        '.git': fakeDirectory('.git', { HEAD: fakeFile('HEAD', 'ref: refs/heads/main') }),
        node_modules: fakeDirectory('node_modules', { 'dep.js': fakeFile('dep.js', 'side effect') })
      })
    );
    expect(project.files['src/components/Button.tsx']).toBe('export {}');
    expect(project.files['assets/logo.png']).toEqual(png);
    expect(Object.keys(project.files).some(path => path.startsWith('.git') || path.startsWith('node_modules'))).toBe(
      false
    );
  });

  it('超过文件数或总大小上限时报错', async () => {
    const tooMany: Record<string, FileSystemFileHandle> = {};
    for (let index = 0; index < 2001; index++) tooMany[`f${index}.ts`] = fakeFile(`f${index}.ts`, '');
    await expect(readFolderProject(fakeDirectory('many', tooMany))).rejects.toThrow('文件数超过 2000');
    await expect(
      readFolderProject(fakeDirectory('huge', { 'huge.bin': fakeFile('huge.bin', new Uint8Array(), 25 * 1024 * 1024) }))
    ).rejects.toThrow('24 MiB');
  });
});

describe('inferFolderTemplate', () => {
  it('无配置目录返回 vanilla 与候选入口', () => {
    expect(inferFolderTemplate({ 'src/main.ts': 'export {}' })).toEqual({
      template: 'vanilla',
      entry: 'src/main.ts',
      configUsable: false
    });
  });

  it('入口仅接受文本文件，二进制同名路径不算命中', () => {
    expect(inferFolderTemplate({ 'src/main.ts': new Uint8Array([0]) }).entry).toBe('src/main.ts');
    expect(inferFolderTemplate({ 'src/main.js': new Uint8Array([0]), 'index.js': 'export {}' }).entry).toBe('index.js');
  });
});
