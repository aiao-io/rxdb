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
  /** 认证失败时提供登录入口。 */
  readonly onLogin?: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;

/** 从粘贴的 github.com URL 或 owner/repo 中解析仓库坐标；支持 /tree/<branch> 后缀。 */
export function parseGitHubRepository(value: string): { owner: string; repo: string; branch?: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let rest = trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null;
    rest = url.pathname;
  } catch {
    // 不是 URL，按 owner/repo 文本处理
  }
  const parts = rest
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean);
  if (parts.length < 2) return null;
  if (parts.length >= 4 && parts[2] === 'tree') {
    return { owner: parts[0], repo: parts[1], branch: parts.slice(3).join('/') };
  }
  return { owner: parts[0], repo: parts[1] };
}

function item(title: string, detail: string, onPick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'wb-github-item';
  const name = document.createElement('span');
  name.className = 'wb-github-item-name';
  name.textContent = title;
  const description = document.createElement('span');
  description.className = 'wb-github-item-detail';
  description.textContent = detail;
  button.append(name, description);
  button.onclick = onPick;
  return button;
}

function message(text: string, kind: 'hint' | 'error'): HTMLParagraphElement {
  const element = document.createElement('p');
  element.className = `wb-github-message wb-github-${kind}`;
  element.textContent = text;
  return element;
}

/**
 * 从 GitHub 打开仓库的对话框：搜索 / 我的仓库 / 粘贴 URL，选定仓库后选分支。
 * 取消（Esc 或按钮）解析为 null；API 失败显示在对话框内，不静默吞掉。
 */
export function requestGitHubRepository(
  host: HTMLElement,
  api: GitHubApi,
  options: GitHubRepositoryRequestOptions = {}
): Promise<GitHubRemoteTarget | null> {
  return new Promise(resolve => {
    ensureGithubStyle();
    const dialog = document.createElement('dialog');
    dialog.className = 'wb-dialog wb-github-dialog';
    const heading = document.createElement('h3');
    heading.textContent = '从 GitHub 打开仓库';
    const input = document.createElement('input');
    input.setAttribute('aria-label', '仓库名称或 URL');
    input.placeholder = '搜索仓库，或粘贴 owner/repo 与 URL';
    const list = document.createElement('div');
    list.className = 'wb-github-list';
    const actions = document.createElement('div');
    actions.className = 'wb-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '取消';
    actions.append(cancel);
    dialog.append(heading, input, list, actions);
    host.append(dialog);

    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let resolved = false;

    const settle = (value: GitHubRemoteTarget | null): void => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      generation++;
      dialog.close();
      resolve(value);
    };
    cancel.onclick = () => settle(null);
    dialog.oncancel = () => settle(null);
    dialog.onclose = () => dialog.remove();

    const renderError = (error: unknown): void => {
      list.replaceChildren();
      const detail =
        error instanceof GitHubApiError ? error.message
        : error instanceof Error ? error.message
        : String(error);
      list.append(message(detail, 'error'));
      if (error instanceof GitHubApiError && error.code === 'auth_required' && options.onLogin) {
        const login = document.createElement('button');
        login.type = 'button';
        login.className = 'wb-github-back';
        login.textContent = '登录 GitHub';
        login.onclick = options.onLogin;
        list.append(login);
      }
    };

    const openBranches = async (owner: string, repo: string, suggested?: string): Promise<void> => {
      const current = ++generation;
      let picked: { owner: string; repo: string; branch: string } | null = null;
      list.replaceChildren(message(`正在加载 ${owner}/${repo} 的分支…`, 'hint'));
      actions.replaceChildren(cancel);
      try {
        const [repository, branches] = await Promise.all([
          api.getRepository(owner, repo),
          api.listBranches(owner, repo)
        ]);
        if (current !== generation) return;
        const ordered = [...branches].sort((left, right) =>
          left.name === repository.defaultBranch ? -1
          : right.name === repository.defaultBranch ? 1
          : 0
        );
        list.replaceChildren();
        const select = (button: HTMLButtonElement, branch: string): void => {
          picked = { owner, repo, branch };
          for (const entry of list.querySelectorAll<HTMLButtonElement>('.wb-github-item')) {
            entry.classList.toggle('wb-github-selected', entry === button);
          }
        };
        const buttons = ordered.map(branch => {
          const button = item(branch.name, branch.sha.slice(0, 7), () => select(button, branch.name));
          list.append(button);
          return { button, branch };
        });
        const initial =
          buttons.find(({ branch }) => branch.name === (suggested ?? repository.defaultBranch)) ?? buttons[0];
        if (initial) select(initial.button, initial.branch.name);
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'wb-github-back';
        back.textContent = '返回选择仓库';
        back.onclick = () => void showResults(input.value);
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'wb-primary wb-github-open';
        open.textContent = '打开';
        open.onclick = () => {
          if (picked) settle(picked);
        };
        actions.replaceChildren(cancel, open);
        list.append(back);
      } catch (error) {
        if (current !== generation) return;
        renderError(error);
      }
    };

    const showResults = async (query: string): Promise<void> => {
      const current = ++generation;
      list.replaceChildren(message('正在搜索仓库…', 'hint'));
      actions.replaceChildren(cancel);
      try {
        const parsed = parseGitHubRepository(query);
        let results: readonly GitHubRepoSummary[];
        if (parsed) {
          const repository = await api.getRepository(parsed.owner, parsed.repo);
          if (current !== generation) return;
          results = [
            {
              fullName: `${repository.owner}/${repository.repo}`,
              description: null,
              stars: 0,
              cloneUrl: '',
              isPrivate: repository.isPrivate
            }
          ];
        } else {
          results = query.trim() ? await api.searchRepositories(query.trim()) : await api.listMyRepositories();
        }
        if (current !== generation) return;
        list.replaceChildren();
        if (results.length === 0) {
          list.append(message('没有找到匹配的仓库', 'hint'));
          return;
        }
        for (const repo of results) {
          const [owner, name] = repo.fullName.split('/');
          list.append(
            item(repo.fullName, repo.description ?? '', () => {
              void openBranches(owner, name, parsed?.branch);
            })
          );
        }
      } catch (error) {
        if (current !== generation) return;
        renderError(error);
      }
    };

    input.oninput = () => {
      if (timer) clearTimeout(timer);
      const value = input.value;
      timer = setTimeout(() => void showResults(value), SEARCH_DEBOUNCE_MS);
    };
    dialog.showModal();
    input.focus();
    void showResults('');
  });
}

export type { GitHubBranch, GitHubRepoSummary };
