import { Orientation, type SerializedDockview } from 'dockview-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createProjectCatalog,
  githubProjectId,
  githubProjectInfo,
  isWorkbenchProject,
  type WorkbenchProjectInfo
} from './catalog.js';

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

  it.each([
    { ...project, remote: { kind: 'github', owner: 'octo', repo: 'r', branch: 'main' } },
    { ...project, remote: { kind: 'github', owner: 'octo', repo: 'r', branch: 'feature/x' } }
  ])('accepts GitHub remote metadata %j', value => expect(isWorkbenchProject(value)).toBe(true));

  it('rejects malformed remote metadata', () => {
    expect(isWorkbenchProject({ ...project, remote: {} })).toBe(false);
    expect(isWorkbenchProject({ ...project, remote: { kind: 'gitlab', owner: 'o', repo: 'r', branch: 'b' } })).toBe(
      false
    );
    expect(isWorkbenchProject({ ...project, remote: { kind: 'github', owner: 1, repo: 'r', branch: 'b' } })).toBe(
      false
    );
  });

  it('builds GitHub project ids and catalog entries with encoded branches', () => {
    expect(githubProjectId('octo', 'repo', 'feature/x')).toBe('github:octo/repo@feature%2Fx');
    expect(githubProjectInfo('octo', 'repo', 'main', 5)).toEqual({
      id: 'github:octo/repo@main',
      name: 'octo/repo',
      template: 'vanilla',
      entry: '',
      updatedAt: 5,
      remote: { kind: 'github', owner: 'octo', repo: 'repo', branch: 'main' }
    });
  });
});

describe('OPFS 项目布局', () => {
  const layout: SerializedDockview = {
    grid: {
      root: { type: 'branch', size: 800, data: [] },
      width: 960,
      height: 800,
      orientation: Orientation.HORIZONTAL
    },
    panels: {}
  };

  beforeEach(() => {
    const files = new Map<string, string>();
    const root = {
      getFileHandle: async (name: string, options?: FileSystemGetFileOptions) => {
        if (!files.has(name) && !options?.create) throw new DOMException('missing', 'NotFoundError');
        return {
          getFile: async () => new File([files.get(name) ?? ''], name),
          createWritable: async () => {
            let next = '';
            return {
              write: async (value: string) => {
                next = value;
              },
              close: async () => {
                files.set(name, next);
              },
              abort: async () => undefined
            };
          }
        };
      }
    };
    vi.stubGlobal('navigator', {
      storage: { getDirectory: async () => ({ getDirectoryHandle: async () => root }) },
      locks: { request: <T>(_name: string, action: () => Promise<T>): Promise<T> => action() }
    });
  });

  it('按项目读写布局，没有记录时为 null', async () => {
    const catalog = createProjectCatalog();
    expect(await catalog.getLayout('one')).toBeNull();
    await catalog.putLayout('one', layout);
    expect(await catalog.getLayout('one')).toEqual(layout);
    expect(await catalog.getLayout('two')).toBeNull();
  });
});
