import { describe, expect, it } from 'vitest';

import { IMPORT_ARCHIVE_ERROR, importedRepositoryName } from './github-archive';

describe('importedRepositoryName', () => {
  it('去掉 .zip 扩展名作为仓库名，扩展名不分大小写', () => {
    expect(importedRepositoryName('project.zip')).toBe('project');
    expect(importedRepositoryName('Project.ZIP')).toBe('Project');
    expect(importedRepositoryName('my.repo.v2.zip')).toBe('my.repo.v2');
  });

  it('只去最后一层扩展名：x.tar.zip 是名为 x.tar 的 zip', () => {
    expect(importedRepositoryName('x.tar.zip')).toBe('x.tar');
  });

  it('只有扩展名时用默认名', () => {
    expect(importedRepositoryName('.zip')).toBe('Imported Repository');
  });

  it('不是 .zip 的文件不认：.tar、.tar.gz、没有扩展名、扩展名后面还有东西', () => {
    for (const name of ['project.tar', 'project.TAR', 'project.tar.gz', 'project.tgz', 'project', 'project.zip.bak'])
      expect(importedRepositoryName(name), name).toBeNull();
  });

  it('给用户的提示点明只支持 .zip', () => {
    expect(IMPORT_ARCHIVE_ERROR).toContain('.zip');
  });
});
