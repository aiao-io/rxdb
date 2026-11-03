import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchBackend } from '../session.js';
import { createRouterBackend } from './git-router-backend.js';

function fakeBackend(): WorkbenchBackend & Record<string, ReturnType<typeof vi.fn>> {
  return {
    open: vi.fn(async () => ({})),
    create: vi.fn(async () => ({})),
    save: vi.fn(async () => ({})),
    remove: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    move: vi.fn(async () => undefined),
    status: vi.fn(async () => ({})),
    stage: vi.fn(async () => undefined),
    unstage: vi.fn(async () => undefined),
    readDiff: vi.fn(async () => ({})),
    discardWorking: vi.fn(async () => ({})),
    commit: vi.fn(async () => 'oid'),
    history: vi.fn(async () => []),
    restore: vi.fn(async () => ({})),
    exportArchive: vi.fn(async () => new Uint8Array()),
    importArchive: vi.fn(async () => undefined),
    dispose: vi.fn()
  } as unknown as WorkbenchBackend & Record<string, ReturnType<typeof vi.fn>>;
}

describe('Git backend router', () => {
  let local: ReturnType<typeof fakeBackend>;
  let github: ReturnType<typeof fakeBackend>;
  let router: WorkbenchBackend;

  beforeEach(() => {
    local = fakeBackend();
    github = fakeBackend();
    router = createRouterBackend({ local, github });
  });

  it('routes github project ids to the virtual repository backend', async () => {
    await router.open('github:octo/repo@main');
    expect(github.open).toHaveBeenCalledWith('github:octo/repo@main');
    expect(local.open).not.toHaveBeenCalled();

    await router.commit('github:octo/repo@main', 'msg');
    await router.stage('github:octo/repo@main', ['a.ts']);
    await router.status('github:octo/repo@main');
    await router.exportArchive('github:octo/repo@main');
    expect(github.commit).toHaveBeenCalledWith('github:octo/repo@main', 'msg');
    expect(github.stage).toHaveBeenCalledWith('github:octo/repo@main', ['a.ts']);
    expect(github.status).toHaveBeenCalledWith('github:octo/repo@main');
    expect(github.exportArchive).toHaveBeenCalledWith('github:octo/repo@main');
    expect(local.commit).not.toHaveBeenCalled();
  });

  it('routes local project ids to the OPFS git backend', async () => {
    await router.open('local-project');
    await router.save('local-project', { 'a.ts': 'v' }, '1');
    await router.history('local-project');
    await router.restore('local-project', 'oid');
    expect(local.open).toHaveBeenCalledWith('local-project');
    expect(local.save).toHaveBeenCalledWith('local-project', { 'a.ts': 'v' }, '1');
    expect(local.history).toHaveBeenCalledWith('local-project');
    expect(local.restore).toHaveBeenCalledWith('local-project', 'oid');
    expect(github.open).not.toHaveBeenCalled();
  });

  it('routes the remaining protocol methods by prefix', async () => {
    await router.create('local-project', {});
    await router.remove('github:octo/repo@main', 'a.ts');
    await router.rename('local-project', 'a', 'b');
    await router.move('github:octo/repo@main', 'src', 'lib');
    await router.unstage('local-project', ['a.ts']);
    await router.readDiff('github:octo/repo@main', 'a.ts', 'working');
    await router.discardWorking('local-project', 'a.ts');
    await router.importArchive('github:octo/repo@main', new Uint8Array());
    expect(local.create).toHaveBeenCalledWith('local-project', {});
    expect(github.remove).toHaveBeenCalledWith('github:octo/repo@main', 'a.ts');
    expect(local.rename).toHaveBeenCalledWith('local-project', 'a', 'b');
    expect(github.move).toHaveBeenCalledWith('github:octo/repo@main', 'src', 'lib');
    expect(local.unstage).toHaveBeenCalledWith('local-project', ['a.ts']);
    expect(github.readDiff).toHaveBeenCalledWith('github:octo/repo@main', 'a.ts', 'working');
    expect(local.discardWorking).toHaveBeenCalledWith('local-project', 'a.ts');
    expect(github.importArchive).toHaveBeenCalledWith('github:octo/repo@main', expect.any(Uint8Array));
  });

  it('disposes both backends', () => {
    router.dispose();
    expect(local.dispose).toHaveBeenCalledOnce();
    expect(github.dispose).toHaveBeenCalledOnce();
  });
});
