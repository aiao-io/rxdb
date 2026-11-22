import { expect, it } from 'vitest';
import { originUrl, withOrigin } from './git-origin.js';

it('读取导入仓库的 origin，并只替换对应远端配置', () => {
  const config = '[core]\n bare = false\n[remote "backup"]\n url = other\n';
  expect(originUrl(config)).toBeNull();
  const linked = withOrigin(config, 'https://github.com/owner/repo.git');
  expect(originUrl(linked)).toBe('https://github.com/owner/repo.git');
  expect(withOrigin(linked, null)).toBe(config);
});
