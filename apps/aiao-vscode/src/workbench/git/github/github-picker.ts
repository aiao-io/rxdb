import { createCodicon } from '../../workbench-icons.js';
import type { GitHubApi } from './github-api.js';
import { GitHubApiError } from './github-api.js';
import { ensureGithubStyle } from './github-style.js';
import type { GitHubBranch, GitHubRepoSummary } from './github-types.js';

export interface GitHubRemoteTarget {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
}

export interface GitHubRepositoryRequestOptions {
  /** 认证失败时等待登录完成，再恢复原请求。 */
  readonly onLogin?: () => void | Promise<void>;
  readonly recentRepositories?: readonly GitHubRemoteTarget[];
}

type RepositoryAddress = { owner: string; repo: string; branch?: string };
type PickerEntry = {
  readonly label: string;
  readonly detail?: string;
  readonly icon: 'github' | 'repo';
  readonly action: 'provider' | 'recent' | 'open' | 'login' | 'retry';
  readonly accept: () => void;
};
const SEARCH_DEBOUNCE_MS = 300;

/** 解析 GitHub 仓库根地址与 tree 分支地址，拒绝其他主机和非仓库页面。 */
export function parseGitHubRepository(value: string): RepositoryAddress | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let path = trimmed;
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password) return null;
      path = url.pathname;
    } catch {
      return null;
    }
  }
  const parts = path.replace(/^\/+|\/+$/g, '').split('/');
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/i, '');
  if (!/^[a-z\d-]+$/i.test(owner) || !repo || !/^[\w.-]+$/.test(repo) || /^\.{1,2}$/.test(repo)) return null;
  if (parts.length === 2) return { owner, repo };
  if (parts.length < 4 || parts[2] !== 'tree') return null;
  try {
    const branch = decodeURIComponent(parts.slice(3).join('/'));
    return branch && !/\s|[~^:?*\[\\]|^\/|\/$|\/\//.test(branch) ? { owner, repo, branch } : null;
  } catch {
    return null;
  }
}

function pickerIcon(name: 'github' | 'repo'): HTMLSpanElement {
  const icon = document.createElement('span');
  icon.className = `codicon codicon-${name}`;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function isAddress(value: string): boolean {
  return /[/:@]/.test(value);
}

/** 先选择远端提供程序，再选择仓库；接受仓库后直接打开默认分支。 */
export function requestGitHubRepository(
  host: HTMLElement,
  api: GitHubApi,
  options: GitHubRepositoryRequestOptions = {}
): Promise<GitHubRemoteTarget | null> {
  return new Promise(resolve => {
    ensureGithubStyle();
    const owner = host.ownerDocument;
    const previousFocus = owner.activeElement instanceof HTMLElement ? owner.activeElement : null;
    const dialog = owner.createElement('dialog');
    dialog.className = 'wb-dialog wb-github-dialog wb-github-picker wb-quick-input';
    const title = owner.createElement('div');
    title.className = 'wb-github-picker-title';
    const back = owner.createElement('button');
    back.type = 'button';
    back.dataset['githubAction'] = 'back';
    back.setAttribute('aria-label', '返回');
    back.title = '返回';
    back.append(createCodicon('arrow-left'));
    const heading = owner.createElement('span');
    heading.className = 'wb-github-picker-heading';
    const cancel = owner.createElement('button');
    cancel.type = 'button';
    cancel.dataset['githubAction'] = 'cancel';
    cancel.setAttribute('aria-label', '取消');
    cancel.title = '取消';
    cancel.append(createCodicon('close'));
    title.append(back, heading, cancel);
    const box = owner.createElement('div');
    box.className = 'wb-quick-input-box';
    const input = owner.createElement('input');
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-autocomplete', 'list');
    const list = owner.createElement('div');
    list.className = 'wb-github-list wb-quick-input-list';
    list.id = `wb-github-repositories-${crypto.randomUUID()}`;
    list.setAttribute('role', 'listbox');
    input.setAttribute('aria-controls', list.id);
    const status = owner.createElement('div');
    status.className = 'wb-github-message wb-quick-input-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    box.append(input);
    dialog.append(title, box, list, status);
    host.append(dialog);
    let screen: 'providers' | 'repositories' = 'providers';
    let providerQuery = '';
    let repositoryQuery: string | null = null;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolved = false;
    let entries: readonly PickerEntry[] = [];
    let selected = 0;

    function invalidate(): number {
      clearTimeout(timer);
      timer = undefined;
      return ++generation;
    }

    function current(expected: number): boolean {
      return !resolved && expected === generation;
    }

    function position(): void {
      const rectangle = host.getBoundingClientRect();
      const titlebar = host.querySelector('.wb-title')?.getBoundingClientRect();
      dialog.style.left = `${rectangle.left + rectangle.width / 2}px`;
      dialog.style.top = `${Math.max(8, (titlebar?.bottom ?? rectangle.top) + 8)}px`;
      dialog.style.width = `${Math.max(280, Math.min(600, rectangle.width - 24))}px`;
    }

    function settle(value: GitHubRemoteTarget | null): void {
      if (resolved) return;
      resolved = true;
      invalidate();
      owner.defaultView?.removeEventListener('resize', position);
      dialog.close();
      dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(value);
    }

    function select(index: number): void {
      if (!entries.length) return;
      selected = (index + entries.length) % entries.length;
      for (const [position, row] of [...list.children].entries()) {
        row.setAttribute('aria-selected', String(position === selected));
        row.classList.toggle('wb-github-selected', position === selected);
      }
      const row = list.children[selected];
      input.setAttribute('aria-activedescendant', row.id);
      row.scrollIntoView?.({ block: 'nearest' });
    }

    function render(next: readonly PickerEntry[], text: string, loading = false, error = false): void {
      entries = next;
      selected = 0;
      list.replaceChildren();
      list.setAttribute('aria-busy', String(loading));
      status.textContent = text;
      status.classList.toggle('wb-github-error', error);
      heading.textContent = screen === 'providers' ? '打开远程仓库' : '从 GitHub 打开仓库';
      dialog.setAttribute('aria-label', heading.textContent);
      input.setAttribute('aria-label', heading.textContent);
      input.placeholder = screen === 'providers' ? '输入远程 URL，或选择远程提供程序' : '选择仓库，或键入要搜索的组织或仓库名称';
      dialog.dataset['githubStep'] = screen;
      back.hidden = screen === 'providers';
      input.removeAttribute('aria-activedescendant');
      for (const [index, entry] of entries.entries()) {
        const button = owner.createElement('button');
        button.type = 'button';
        button.tabIndex = -1;
        button.className = 'wb-github-item';
        button.id = `${list.id}-${generation}-${index}`;
        button.dataset['githubAction'] = entry.action;
        button.setAttribute('role', 'option');
        const name = owner.createElement('span');
        name.className = 'wb-github-item-name wb-quick-input-label';
        name.textContent = entry.label;
        button.append(pickerIcon(entry.icon), name);
        if (entry.detail) {
          const detail = owner.createElement('span');
          detail.className = 'wb-github-item-detail wb-quick-input-description';
          detail.textContent = entry.detail;
          button.append(detail);
        }
        button.onclick = entry.accept;
        button.onpointermove = () => select(index);
        list.append(button);
      }
      if (entries.length) select(0);
    }

    function renderError(cause: unknown, retry: () => void): void {
      const detail = cause instanceof Error ? cause.message : String(cause);
      const items: PickerEntry[] = [];
      if (cause instanceof GitHubApiError && cause.code === 'auth_required' && options.onLogin) {
        items.push({ label: '登录 GitHub', icon: 'github', action: 'login', accept: () => void login(retry) });
      }
      items.push({ label: '重试', icon: 'repo', action: 'retry', accept: retry });
      render(items, detail, false, true);
      input.focus();
    }

    async function login(retry: () => void): Promise<void> {
      const expected = invalidate();
      render([], '正在登录 GitHub…', true);
      try {
        await options.onLogin?.();
        if (current(expected)) retry();
      } catch (cause) {
        if (current(expected)) renderError(cause, retry);
      }
    }

    async function openRepository(address: RepositoryAddress): Promise<void> {
      const expected = invalidate();
      render([], `正在打开 ${address.owner}/${address.repo}…`, true);
      try {
        const repository = await api.getRepository(address.owner, address.repo);
        if (!current(expected)) return;
        settle({ owner: repository.owner, repo: repository.repo, branch: address.branch ?? repository.defaultBranch });
      } catch (cause) {
        if (current(expected)) renderError(cause, () => void openRepository(address));
      }
    }

    function direct(address: RepositoryAddress): PickerEntry {
      return {
        label: `打开 ${address.owner}/${address.repo}`,
        detail: address.branch,
        icon: 'repo',
        action: 'open',
        accept: () => void openRepository(address)
      };
    }

    function renderProviders(): void {
      const query = input.value.trim();
      const address = parseGitHubRepository(query);
      if (address) return render([direct(address)], '按 Enter 打开仓库');
      if (isAddress(query)) return render([], '请输入有效的 GitHub 仓库 URL 或 owner/repo', false, true);
      const recent = (options.recentRepositories ?? []).filter(target => `${target.owner}/${target.repo} ${target.branch}`.toLowerCase().includes(query.toLowerCase()));
      render([
        { label: '从 GitHub 打开仓库', icon: 'github', action: 'provider', accept: enterGitHub },
        ...recent.map((target): PickerEntry => ({
          label: `${target.owner}/${target.repo}`,
          detail: target.branch,
          icon: 'repo',
          action: 'recent',
          accept: () => settle(target)
        }))
      ], recent.length ? '选择提供程序或最近打开的远程仓库' : '选择远程提供程序');
    }

    async function showRepositories(query: string, expected: number): Promise<void> {
      const address = parseGitHubRepository(query);
      if (address) return render([direct(address)], '按 Enter 打开仓库');
      if (isAddress(query)) return render([], '请输入有效的 GitHub 仓库 URL 或 owner/repo', false, true);
      render([], query.trim() ? '正在搜索仓库…' : '正在加载我的仓库…', true);
      try {
        const repositories = query.trim() ? await api.searchRepositories(query.trim()) : await api.listMyRepositories();
        if (!current(expected)) return;
        render(repositories.map((repository): PickerEntry => {
          const [owner, repo] = repository.fullName.split('/');
          return {
            label: repository.fullName,
            detail: repository.description ?? undefined,
            icon: 'repo',
            action: 'open',
            accept: () => void openRepository({ owner, repo })
          };
        }), repositories.length ? `${repositories.length} 个仓库` : '没有找到匹配的仓库');
      } catch (cause) {
        if (current(expected)) renderError(cause, () => void showRepositories(query, invalidate()));
      }
    }

    function enterGitHub(): void {
      providerQuery = input.value;
      input.value = repositoryQuery ?? providerQuery;
      screen = 'repositories';
      void showRepositories(input.value, invalidate());
      input.focus();
    }

    back.onclick = () => {
      repositoryQuery = input.value;
      input.value = providerQuery;
      screen = 'providers';
      invalidate();
      renderProviders();
      input.focus();
    };
    cancel.onclick = () => settle(null);
    dialog.oncancel = event => {
      event.preventDefault();
      settle(null);
    };
    dialog.onclose = () => settle(null);
    dialog.onpointerdown = event => {
      if (event.target !== dialog) return;
      const rectangle = dialog.getBoundingClientRect();
      if (event.clientX < rectangle.left || event.clientX > rectangle.right || event.clientY < rectangle.top || event.clientY > rectangle.bottom) settle(null);
    };
    input.oninput = () => {
      const expected = invalidate();
      if (screen === 'providers') return renderProviders();
      repositoryQuery = input.value;
      const query = input.value;
      if (parseGitHubRepository(query) || isAddress(query)) {
        void showRepositories(query, expected);
        return;
      }
      render([], '正在搜索仓库…', true);
      timer = setTimeout(() => { timer = undefined; void showRepositories(query, expected); }, SEARCH_DEBOUNCE_MS);
    };
    input.onkeydown = event => {
      if (event.isComposing) return;
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') return settle(null);
      if (event.key === 'Enter') return entries[selected]?.accept();
      select(selected + (event.key === 'ArrowDown' ? 1 : -1));
    };
    renderProviders();
    position();
    owner.defaultView?.addEventListener('resize', position);
    dialog.showModal();
    input.focus();
  });
}

export type { GitHubBranch, GitHubRepoSummary };
