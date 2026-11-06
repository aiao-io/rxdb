// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchCatalog } from './catalog.js';
import { githubProjectInfo } from './catalog.js';
import type { WorkbenchEditorMount } from './editor.js';
import type { GitHubApi } from './git/github/github-api.js';
import type { GitHubAuth } from './git/github/github-auth.js';
import { mountWorkbench, type WorkbenchHandle } from './mount.js';
import type { WorkbenchBackend } from './session.js';

const mocks = vi.hoisted(() => ({ requestRepository: vi.fn(), requestLogin: vi.fn() }));
vi.mock('./git/github/github-picker.js', () => ({ requestGitHubRepository: mocks.requestRepository }));
vi.mock('./git/github/github-login.js', () => ({ requestGitHubLogin: mocks.requestLogin }));

const instances: WorkbenchHandle[] = [];
afterEach(() => {
  instances.splice(0).forEach(handle => handle.dispose());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

beforeEach(() => {
  vi.clearAllMocks();
});

function fixture(withGithub = true): {
  host: HTMLElement;
  backend: WorkbenchBackend & Record<string, ReturnType<typeof vi.fn>>;
  catalog: WorkbenchCatalog & Record<string, ReturnType<typeof vi.fn>>;
  githubApi: GitHubApi;
  githubAuth: GitHubAuth;
} {
  const backend = {
    open: vi.fn(async (projectId: string) => ({ projectId, revision: 'head-1', files: {} })),
    create: vi.fn(async () => ({})),
    save: vi.fn(async () => ({})),
    remove: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    move: vi.fn(async () => undefined),
    status: vi.fn(async () => ({ branch: 'main', head: null, entries: [] })),
    stage: vi.fn(async () => undefined),
    unstage: vi.fn(async () => undefined),
    readDiff: vi.fn(async () => ({
      base: { exists: true, binary: false, text: '', byteLength: 0 },
      modified: { exists: true, binary: false, text: '', byteLength: 0 }
    })),
    discardWorking: vi.fn(async () => ({})),
    commit: vi.fn(async () => 'oid'),
    history: vi.fn(async () => []),
    restore: vi.fn(async () => ({})),
    exportArchive: vi.fn(async () => new Uint8Array()),
    importArchive: vi.fn(async () => undefined),
    dispose: vi.fn()
  } as unknown as WorkbenchBackend & Record<string, ReturnType<typeof vi.fn>>;
  const catalog = {
    list: vi.fn(async () => []),
    put: vi.fn(async () => undefined),
    getState: vi.fn(async () => null),
    putState: vi.fn(async () => undefined),
    getLayout: vi.fn(async () => null),
    getPreferences: vi.fn(async () => null),
    putPreferences: vi.fn(async () => undefined),
    putLayout: vi.fn(async () => undefined)
  } as unknown as WorkbenchCatalog & Record<string, ReturnType<typeof vi.fn>>;
  const editorHandle = {
    update: vi.fn(),
    replace: vi.fn(),
    dispose: vi.fn(),
    runCommand: vi.fn(() => true),
    setIndentUnit: vi.fn(),
    setDiagnostics: vi.fn()
  };
  const mountEditor = vi.fn<WorkbenchEditorMount>(() => editorHandle);
  const compiler = { compile: vi.fn(async () => ({ js: '', css: '' })), dispose: vi.fn() };
  const githubApi = {} as GitHubApi;
  const githubAuth = {
    getSession: vi.fn(async () => null),
    subscribe: vi.fn(() => () => undefined),
    logout: vi.fn(async () => undefined)
  } as unknown as GitHubAuth;
  const host = document.createElement('div');
  document.body.append(host);
  const handle = mountWorkbench(
    host,
    {
      backend: backend as WorkbenchBackend,
      compiler,
      catalog: catalog as WorkbenchCatalog,
      ...(withGithub ? { githubApi, githubAuth } : {})
    },
    mountEditor
  );
  instances.push(handle);
  return { host, backend, catalog, githubApi, githubAuth };
}

describe('GitHub welcome view entry', () => {
  it('renders the GitHub button in the welcome view when the API is provided', async () => {
    const { host } = fixture();
    await vi.waitFor(() => expect(host.querySelector('[data-welcome-action="open-github"]')).not.toBeNull());
  });

  it('omits the button without a GitHub API', async () => {
    const { host } = fixture(false);
    await vi.waitFor(() => expect(host.querySelector('.wb-empty-view')).not.toBeNull());
    expect(host.querySelector('[data-welcome-action="open-github"]')).toBeNull();
  });

  it('opens the picked repository through the catalog and session', async () => {
    const { host, backend, catalog, githubApi } = fixture();
    await vi.waitFor(() => expect(host.querySelector('[data-welcome-action="open-github"]')).not.toBeNull());
    mocks.requestRepository.mockResolvedValue({ owner: 'octo', repo: 'repo', branch: 'feature/x' });
    host.querySelector<HTMLButtonElement>('[data-welcome-action="open-github"]')!.click();

    await vi.waitFor(() => expect(backend.open).toHaveBeenCalledWith('github:octo/repo@feature%2Fx'));
    expect(mocks.requestRepository).toHaveBeenCalledWith(
      host.querySelector('.ao-workbench'),
      githubApi,
      expect.objectContaining({ onLogin: expect.any(Function) })
    );
    expect(catalog.put).toHaveBeenCalledWith(githubProjectInfo('octo', 'repo', 'feature/x', expect.any(Number)));
  });

  it('does nothing when the picker is cancelled', async () => {
    const { host, backend, catalog } = fixture();
    await vi.waitFor(() => expect(host.querySelector('[data-welcome-action="open-github"]')).not.toBeNull());
    mocks.requestRepository.mockResolvedValue(null);
    host.querySelector<HTMLButtonElement>('[data-welcome-action="open-github"]')!.click();
    await vi.waitFor(() => expect(mocks.requestRepository).toHaveBeenCalledOnce());
    expect(backend.open).not.toHaveBeenCalled();
    expect(catalog.put).not.toHaveBeenCalled();
  });

  it('renders the login entry in the welcome view and opens the login dialog', async () => {
    const { host, githubAuth } = fixture();
    await vi.waitFor(() => expect(host.querySelector('[data-welcome-action="github-login"]')).not.toBeNull());
    host.querySelector<HTMLButtonElement>('[data-welcome-action="github-login"]')!.click();
    expect(mocks.requestLogin).toHaveBeenCalledWith(host.querySelector('.ao-workbench'), { auth: githubAuth });
  });

  it('omits the login entry without a GitHub auth provider', async () => {
    const { host } = fixture(false);
    await vi.waitFor(() => expect(host.querySelector('.wb-empty-view')).not.toBeNull());
    expect(host.querySelector('[data-welcome-action="github-login"]')).toBeNull();
  });

  it('wires the picker login hook to the login dialog', async () => {
    const { host, githubAuth } = fixture();
    await vi.waitFor(() => expect(host.querySelector('[data-welcome-action="open-github"]')).not.toBeNull());
    host.querySelector<HTMLButtonElement>('[data-welcome-action="open-github"]')!.click();
    await vi.waitFor(() => expect(mocks.requestRepository).toHaveBeenCalledOnce());
    const onLogin = (mocks.requestRepository.mock.calls[0][2] as { onLogin: () => void }).onLogin;
    onLogin();
    expect(mocks.requestLogin).toHaveBeenCalledWith(host.querySelector('.ao-workbench'), { auth: githubAuth });
  });
});
