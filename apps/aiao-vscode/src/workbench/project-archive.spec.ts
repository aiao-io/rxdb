import { describe, expect, it } from 'vitest';
import { encodeGitArchive } from './git/git-archive.js';
import { projectArchiveInfo } from './project-archive.js';

const encoded = (config?: string, entry = 'src/main.ts') =>
  encodeGitArchive({
    directories: ['.git', 'src'],
    files: Object.entries({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.git/config': '[core]\n bare = false\n',
      [entry]: 'console.log(1)',
      ...(config === undefined ? {} : { 'workbench.project.json': config })
    }).map(([path, text]) => ({ path, bytes: new TextEncoder().encode(text) }))
  });

describe('复制项目归档先校验再写入', () => {
  it('沿用受控模板与真实存在的入口', () => {
    expect(projectArchiveInfo('copy.zip', encoded('{"template":"vanilla","entry":"src/main.ts"}'))).toEqual({
      name: 'copy',
      template: 'vanilla',
      entry: 'src/main.ts'
    });
  });
  it.each([
    undefined,
    'invalid',
    'null',
    '{"template":"unknown","entry":"src/main.ts"}',
    '{"template":"react","entry":"missing.ts"}'
  ])('拒绝不完整配置 %s', config => {
    expect(() => projectArchiveInfo('bad.zip', encoded(config))).toThrow();
  });
  it('不接受伪 ZIP 字节', () => {
    expect(() => projectArchiveInfo('bad.zip', new Uint8Array([0, 255]))).toThrow();
  });
});
