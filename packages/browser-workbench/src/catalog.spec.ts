import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProjectCatalog, isWorkbenchProject, type WorkbenchProjectInfo } from './catalog.js';

const project: WorkbenchProjectInfo = {
  id: 'one',
  name: 'project',
  template: 'react',
  entry: 'src/main.tsx',
  updatedAt: 1
};

describe('OPFS workbench project catalog', () => {
  let content: string | undefined;
  let failWrite: boolean;
  let failRead: boolean;
  const abort = vi.fn(async () => undefined);

  beforeEach(() => {
    content = undefined;
    failWrite = false;
    failRead = false;
    abort.mockClear();
    let tail = Promise.resolve();
    const root = {
      getFileHandle: async (_name: string, options?: FileSystemGetFileOptions) => {
        if (failRead) throw new DOMException('permission', 'NotAllowedError');
        if (content === undefined && !options?.create) throw new DOMException('missing', 'NotFoundError');
        return {
          getFile: async () => new File([content ?? ''], 'projects.json'),
          createWritable: async () => {
            let next = '';
            return {
              write: async (value: string) => {
                if (failWrite) throw new DOMException('quota', 'QuotaExceededError');
                next = value;
              },
              close: async () => {
                content = next;
              },
              abort
            };
          }
        };
      }
    };
    vi.stubGlobal('navigator', {
      storage: { getDirectory: async () => ({ getDirectoryHandle: async () => root }) },
      locks: {
        request: <T>(_name: string, action: () => Promise<T>): Promise<T> => {
          const result = tail.then(action);
          tail = result.then(
            () => undefined,
            () => undefined
          );
          return result;
        }
      }
    });
  });

  it('starts empty, persists project metadata, replaces one ID and serializes concurrent updates', async () => {
    const catalog = createProjectCatalog();
    expect(await catalog.list()).toEqual([]);
    await Promise.all([catalog.put(project), catalog.put({ ...project, id: 'two' })]);
    expect(await catalog.list()).toHaveLength(2);
    await catalog.put({ ...project, name: 'renamed' });
    expect((await catalog.list()).find(item => item.id === 'one')?.name).toBe('renamed');
    expect(await catalog.list()).toHaveLength(2);
  });

  it('rejects corrupt metadata and permission errors without replacing saved content', async () => {
    const catalog = createProjectCatalog();
    content = JSON.stringify([{ ...project, template: 'unknown' }]);
    await expect(catalog.list()).rejects.toThrow('项目目录损坏');
    content = '{}';
    await expect(catalog.list()).rejects.toThrow('项目目录损坏');
    failRead = true;
    await expect(catalog.list()).rejects.toThrow('permission');
  });

  it('aborts failed writes and propagates missing storage capabilities', async () => {
    const catalog = createProjectCatalog();
    await catalog.put(project);
    const original = content;
    failWrite = true;
    await expect(catalog.put({ ...project, id: 'failed' })).rejects.toThrow('quota');
    expect(abort).toHaveBeenCalledOnce();
    expect(content).toBe(original);
    vi.stubGlobal('navigator', { locks: { request: (_name: string, action: () => Promise<unknown>) => action() } });
    await expect(catalog.list()).rejects.toThrow('OPFS');
  });

  it.each([
    null,
    undefined,
    'project',
    {},
    { ...project, updatedAt: Infinity },
    { ...project, entry: 1 },
    { ...project, template: 'node' }
  ])('rejects invalid metadata %j', value => expect(isWorkbenchProject(value)).toBe(false));
});
