import { describe, expect, it } from 'vitest';
import { readPickedFolderProject } from './folder-import.js';

function selected(path: string, data: string | Uint8Array = 'text', size?: number): File {
  const file = new File([typeof data === 'string' ? data : new Uint8Array(data)], path.split('/').at(-1)!);
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('嵌入环境的本机文件夹副本', () => {
  it('保留相对路径、BOM、空文件与二进制，跳过依赖和 Git 目录', async () => {
    const result = await readPickedFolderProject([
      selected('demo/src/main.ts', '\ufeffconsole.log(1)'),
      selected('demo/assets/x.bin', new Uint8Array([0, 255])),
      selected('demo/empty.txt', ''),
      selected('demo/node_modules/pkg/index.js'),
      selected('demo/.git/config')
    ]);
    expect(result?.name).toBe('demo');
    expect(result?.files).toEqual({
      'src/main.ts': '\ufeffconsole.log(1)',
      'assets/x.bin': new Uint8Array([0, 255]),
      'empty.txt': '',
      'workbench.project.json': JSON.stringify({ template: 'vanilla', entry: 'src/main.ts' }, null, 2)
    });
  });

  it('取消返回空结果；保留合法受控模板配置', async () => {
    expect(await readPickedFolderProject([])).toBeNull();
    const result = await readPickedFolderProject([
      selected('app/workbench.project.json', '{"template":"react","entry":"src/main.tsx"}'),
      selected('app/src/main.tsx', 'export default 1')
    ]);
    expect(result?.template).toBe('react');
    expect(result?.entry).toBe('src/main.tsx');
  });

  it.each([
    ['demo/../x.ts'],
    ['demo/a.ts', 'other/b.ts'],
    ['x.ts'],
    ['demo/A.ts', 'demo/a.ts'],
    ['demo/a.ts', 'demo/a.ts'],
    ['demo/src', 'demo/src/main.ts']
  ])('拒绝不安全或冲突的相对路径 %s', async (...paths) => {
    await expect(readPickedFolderProject(paths.map(path => selected(path)))).rejects.toThrow();
  });

  it('在读取内容前拒绝超出 24 MiB 或 2000 文件的选择', async () => {
    await expect(readPickedFolderProject([selected('demo/big.txt', '', 24 * 1024 * 1024 + 1)])).rejects.toThrow(
      '24 MiB'
    );
    await expect(
      readPickedFolderProject(Array.from({ length: 2001 }, (_, i) => selected(`demo/${i}.txt`)))
    ).rejects.toThrow('2000');
  });

  it('读取失败不返回部分项目', async () => {
    const bad = selected('demo/bad.txt');
    bad.arrayBuffer = async () => {
      throw new Error('read failed');
    };
    await expect(readPickedFolderProject([selected('demo/ok.txt'), bad])).rejects.toThrow('read failed');
  });
});
