import {
  GitHubApiError,
  GitHubBranch,
  GitHubCommitInfo,
  GitHubCommitSummary,
  GitHubQuota,
  GitHubRepo,
  GitHubRepoSummary,
  GitHubTreeEntry,
  GitHubUser
} from './github-types.js';

export { GitHubApiError } from './github-types.js';

/** git database API 的树条目：内联内容、既有 blob 或删除（sha 为 null）。 */
export interface GitHubTreeItem {
  readonly path: string;
  readonly mode?: string;
  readonly content?: string;
  readonly sha?: string | null;
}

export interface GitHubApiOptions {
  readonly getToken: () => Promise<string | null>;
  readonly apiBase?: string;
  readonly fetchFn?: typeof fetch;
  readonly userAgent?: string;
}

export interface GitHubApi {
  getAuthenticatedUser(): Promise<GitHubUser>;
  searchRepositories(query: string, perPage?: number): Promise<readonly GitHubRepoSummary[]>;
  listMyRepositories(perPage?: number): Promise<readonly GitHubRepoSummary[]>;
  getRepository(owner: string, repo: string): Promise<GitHubRepo>;
  listBranches(owner: string, repo: string, perPage?: number): Promise<readonly GitHubBranch[]>;
  getBranchSha(owner: string, repo: string, branch: string): Promise<string>;
  getTreeFiles(owner: string, repo: string, treeSha: string): Promise<readonly GitHubTreeEntry[]>;
  getFileContents(owner: string, repo: string, path: string, ref: string): Promise<Uint8Array>;
  listCommits(
    owner: string,
    repo: string,
    ref: string,
    perPage?: number,
    page?: number
  ): Promise<readonly GitHubCommitSummary[]>;
  getCommit(owner: string, repo: string, ref: string): Promise<GitHubCommitInfo>;
  createBlob(owner: string, repo: string, bytes: Uint8Array): Promise<string>;
  createTree(owner: string, repo: string, baseTree: string | null, items: readonly GitHubTreeItem[]): Promise<string>;
  createCommit(owner: string, repo: string, message: string, tree: string, parents: readonly string[]): Promise<string>;
  updateRef(owner: string, repo: string, ref: string, sha: string, force?: boolean): Promise<void>;
  createRepository(name: string, isPrivate: boolean): Promise<GitHubRepoSummary>;
  getZipball(owner: string, repo: string, ref: string): Promise<Uint8Array>;
  quota(): GitHubQuota;
  clearCache(): void;
}

interface JsonRecord {
  [key: string]: unknown;
}

/** 按 Link 头解析下一页地址；无下一页返回 null。 */
function nextPage(link: string | null): string | null {
  if (!link) return null;
  const match = /<([^>]+)>;\s*rel="next"/.exec(link);
  return match?.[1] ?? null;
}

function toBytes(json: JsonRecord): Uint8Array {
  const content = json['content'];
  const encoding = json['encoding'];
  if (encoding === 'none' || content === null) return new Uint8Array(0);
  if (encoding !== 'base64' || typeof content !== 'string') {
    throw new GitHubApiError('invalid_response', '文件内容响应缺少 base64 数据');
  }
  const clean = content.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** 把字节编码为 base64（分块构造二进制字符串，避免大数组展开栈溢出）。 */
function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(''));
}

function parseRepoSummary(json: JsonRecord): GitHubRepoSummary {
  return {
    fullName: String(json['full_name']),
    description: typeof json['description'] === 'string' ? json['description'] : null,
    stars: Number(json['stargazers_count'] ?? 0),
    cloneUrl: String(json['clone_url'] ?? ''),
    isPrivate: Boolean(json['private'])
  };
}

/** 创建针对 api.github.com 的 REST 客户端；token 由调用方按需提供，公开仓库可以匿名访问。 */
export function createGitHubApi(options: GitHubApiOptions): GitHubApi {
  const getToken = options.getToken;
  const apiBase = (options.apiBase ?? 'https://api.github.com').replace(/\/+$/, '');
  const fetchFn = options.fetchFn ?? fetch;
  const userAgent = options.userAgent ?? 'aiao-vscode';
  const cache = new Map<string, { etag: string; json: unknown }>();
  let quotaState: GitHubQuota = { remaining: null, limit: null, resetAt: null };

  function trackQuota(response: Response): void {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const limit = response.headers.get('x-ratelimit-limit');
    const reset = response.headers.get('x-ratelimit-reset');
    quotaState = {
      remaining: remaining === null ? quotaState.remaining : Number(remaining),
      limit: limit === null ? quotaState.limit : Number(limit),
      resetAt: reset === null ? quotaState.resetAt : Number(reset)
    };
  }

  async function readError(response: Response): Promise<GitHubApiError> {
    let detail = '';
    try {
      const json = (await response.json()) as JsonRecord;
      if (typeof json['message'] === 'string') detail = json['message'];
    } catch {
      // 响应体不是 JSON 时忽略详情
    }
    return new GitHubApiError(
      'invalid_response',
      `GitHub API 返回 ${response.status}${detail ? `：${detail}` : ''}`,
      response.status
    );
  }

  async function httpError(response: Response): Promise<GitHubApiError> {
    if (response.status === 401) {
      return new GitHubApiError('auth_required', '登录凭据无效或已过期', response.status);
    }
    if (response.status === 403) {
      if (response.headers.get('x-ratelimit-remaining') === '0') {
        return new GitHubApiError('rate_limited', 'GitHub 请求超出限额，请稍后重试', response.status);
      }
      return new GitHubApiError('forbidden', '没有执行该操作的权限', response.status);
    }
    if (response.status === 404) {
      return new GitHubApiError('not_found', '仓库不存在或无权访问', response.status);
    }
    if (response.status === 409 || response.status === 422) {
      return new GitHubApiError('conflict', '远端分支已被更新或内容冲突', response.status);
    }
    return readError(response);
  }

  /** 发起带统一头、token、限额记账与错误映射的请求；返回原始响应。 */
  async function requestRaw(url: string, init: RequestInit = {}, cacheable = false): Promise<Response> {
    const token = await getToken();
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': userAgent,
      ...(init.headers as Record<string, string> | undefined)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (cacheable) {
      const hit = cache.get(url);
      if (hit) headers['If-None-Match'] = hit.etag;
    }
    let response: Response;
    try {
      response = await fetchFn(url, { ...init, headers });
    } catch (cause) {
      throw new GitHubApiError('network_failed', '无法连接 GitHub API', undefined, { cause });
    }
    trackQuota(response);
    if (!response.ok && !(cacheable && response.status === 304)) throw await httpError(response);
    return response;
  }

  async function readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (cause) {
      throw new GitHubApiError('invalid_response', 'GitHub API 返回了无法解析的内容', response.status, { cause });
    }
  }

  function asRecord(value: unknown): JsonRecord {
    if (typeof value !== 'object' || value === null) {
      throw new GitHubApiError('invalid_response', 'GitHub API 返回了意外的响应结构');
    }
    return value as JsonRecord;
  }

  /** JSON 请求；cacheable 时按 ETag 复用缓存并接受 304。 */
  async function requestJson(path: string, init: RequestInit = {}, cacheable = false): Promise<unknown> {
    const url = path.startsWith('http') ? path : apiBase + path;
    const response = await requestRaw(url, init, cacheable);
    if (response.status === 204) return null;
    if (response.status === 304) {
      const hit = cache.get(url);
      if (hit) return hit.json;
    }
    const json = await readJson(response);
    if (cacheable) {
      const etag = response.headers.get('etag');
      if (etag) cache.set(url, { etag, json });
    }
    return json;
  }

  function query(params: Record<string, string | number>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) search.set(key, String(value));
    return search.toString();
  }

  /** 按 Link rel=next 分页收集；每一页都是独立请求，不做缓存。 */
  async function paginate<T>(
    path: string,
    params: Record<string, string | number>,
    parse: (item: unknown) => T
  ): Promise<T[]> {
    const result: T[] = [];
    let next: string | null = `${apiBase}${path}?${query(params)}`;
    while (next) {
      const response = await requestRaw(next);
      if (response.status === 204) break;
      const value = await readJson(response);
      if (!Array.isArray(value)) throw new GitHubApiError('invalid_response', 'GitHub API 分页响应不是数组');
      for (const item of value) result.push(parse(item));
      next = nextPage(response.headers.get('link'));
    }
    return result;
  }

  const repoPath = (owner: string, repo: string): string =>
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const filePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

  return {
    async getAuthenticatedUser(): Promise<GitHubUser> {
      const json = asRecord(await requestJson('/user', {}, true));
      const login = json['login'];
      if (typeof login !== 'string' || !login) {
        throw new GitHubApiError('invalid_response', '/user 响应缺少 login');
      }
      const avatar = json['avatar_url'];
      return { login, avatarUrl: typeof avatar === 'string' ? avatar : null };
    },

    async searchRepositories(queryValue: string, perPage = 30): Promise<readonly GitHubRepoSummary[]> {
      const json = asRecord(
        await requestJson(
          `/search/repositories?${query({ q: `${queryValue} fork:true`, sort: 'stars', per_page: perPage })}`
        )
      );
      const items = json['items'];
      if (!Array.isArray(items)) throw new GitHubApiError('invalid_response', '搜索响应缺少 items');
      return items.map(item => parseRepoSummary(asRecord(item)));
    },

    async listMyRepositories(perPage = 100): Promise<readonly GitHubRepoSummary[]> {
      return paginate('/user/repos', { sort: 'updated', per_page: perPage, page: 1 }, item =>
        parseRepoSummary(asRecord(item))
      );
    },

    async getRepository(owner: string, repo: string): Promise<GitHubRepo> {
      const json = asRecord(await requestJson(repoPath(owner, repo)));
      return {
        owner: String(asRecord(json['owner'])['login'] ?? owner),
        repo,
        defaultBranch: String(json['default_branch'] ?? 'main'),
        isPrivate: Boolean(json['private'])
      };
    },

    async listBranches(owner: string, repo: string, perPage = 100): Promise<readonly GitHubBranch[]> {
      return paginate(`${repoPath(owner, repo)}/branches`, { per_page: perPage, page: 1 }, item => {
        const json = asRecord(item);
        return { name: String(json['name']), sha: String(asRecord(json['commit'])['sha'] ?? '') };
      });
    },

    async getBranchSha(owner: string, repo: string, branch: string): Promise<string> {
      const json = asRecord(await requestJson(`${repoPath(owner, repo)}/branches/${encodeURIComponent(branch)}`));
      const sha = asRecord(json['commit'])['sha'];
      if (typeof sha !== 'string' || !sha) throw new GitHubApiError('invalid_response', '分支响应缺少 commit.sha');
      return sha;
    },

    async getTreeFiles(owner: string, repo: string, treeSha: string): Promise<readonly GitHubTreeEntry[]> {
      const base = `${repoPath(owner, repo)}/git/trees`;
      const root = asRecord(await requestJson(`${base}/${treeSha}?recursive=1`, {}, true));
      const rawTree = root['tree'];
      if (!Array.isArray(rawTree)) throw new GitHubApiError('invalid_response', '树响应缺少 tree');
      const entries: GitHubTreeEntry[] = [];
      const subtrees: { path: string; sha: string }[] = [];
      for (const item of rawTree) {
        const json = asRecord(item);
        if (json['type'] === 'tree' && typeof json['sha'] === 'string') {
          subtrees.push({ path: String(json['path']), sha: json['sha'] });
        } else if (json['type'] === 'blob' && typeof json['sha'] === 'string') {
          entries.push({ path: String(json['path']), sha: json['sha'], mode: String(json['mode'] ?? '100644') });
        }
      }
      while (subtrees.length) {
        const subtree = subtrees.pop()!;
        const json = asRecord(await requestJson(`${base}/${subtree.sha}`, {}, true));
        const raw = json['tree'];
        if (!Array.isArray(raw)) throw new GitHubApiError('invalid_response', '子树响应缺少 tree');
        for (const item of raw) {
          const child = asRecord(item);
          const childPath = `${subtree.path}/${String(child['path'])}`;
          if (child['type'] === 'tree' && typeof child['sha'] === 'string') {
            subtrees.push({ path: childPath, sha: child['sha'] });
          } else if (child['type'] === 'blob' && typeof child['sha'] === 'string') {
            entries.push({ path: childPath, sha: child['sha'], mode: String(child['mode'] ?? '100644') });
          }
        }
      }
      return entries;
    },

    async getFileContents(owner: string, repo: string, path: string, ref: string): Promise<Uint8Array> {
      const json = asRecord(
        await requestJson(`${repoPath(owner, repo)}/contents/${filePath(path)}?${query({ ref })}`, {}, true)
      );
      return toBytes(json);
    },

    async listCommits(
      owner: string,
      repo: string,
      ref: string,
      perPage = 30,
      page = 1
    ): Promise<readonly GitHubCommitSummary[]> {
      return paginate(`${repoPath(owner, repo)}/commits`, { sha: ref, per_page: perPage, page }, item => {
        const json = asRecord(item);
        return { oid: String(json['sha']), message: String(asRecord(json['commit'])['message'] ?? '') };
      });
    },

    async getCommit(owner: string, repo: string, ref: string): Promise<GitHubCommitInfo> {
      const json = asRecord(await requestJson(`${repoPath(owner, repo)}/commits/${encodeURIComponent(ref)}`));
      const commit = asRecord(json['commit']);
      const parents = json['parents'];
      return {
        sha: String(json['sha']),
        treeSha: String(asRecord(commit['tree'])['sha'] ?? ''),
        parents: Array.isArray(parents) ? parents.map(parent => String(asRecord(parent)['sha'])) : [],
        message: String(commit['message'] ?? '')
      };
    },

    async createBlob(owner: string, repo: string, bytes: Uint8Array): Promise<string> {
      const json = asRecord(
        await requestJson(`${repoPath(owner, repo)}/git/blobs`, {
          method: 'POST',
          body: JSON.stringify({ content: toBase64(bytes), encoding: 'base64' })
        })
      );
      const sha = json['sha'];
      if (typeof sha !== 'string' || !sha) throw new GitHubApiError('invalid_response', 'blob 响应缺少 sha');
      return sha;
    },

    async createTree(
      owner: string,
      repo: string,
      baseTree: string | null,
      items: readonly GitHubTreeItem[]
    ): Promise<string> {
      const json = asRecord(
        await requestJson(`${repoPath(owner, repo)}/git/trees`, {
          method: 'POST',
          body: JSON.stringify({
            base_tree: baseTree,
            tree: items.map(item => {
              if (item.sha === null) return { path: item.path, sha: null };
              return {
                path: item.path,
                mode: item.mode ?? '100644',
                ...(item.content !== undefined ? { content: item.content } : { sha: item.sha })
              };
            })
          })
        })
      );
      const sha = json['sha'];
      if (typeof sha !== 'string' || !sha) throw new GitHubApiError('invalid_response', '树响应缺少 sha');
      return sha;
    },

    async createCommit(
      owner: string,
      repo: string,
      message: string,
      tree: string,
      parents: readonly string[]
    ): Promise<string> {
      const json = asRecord(
        await requestJson(`${repoPath(owner, repo)}/git/commits`, {
          method: 'POST',
          body: JSON.stringify({ message, tree, parents })
        })
      );
      const sha = json['sha'];
      if (typeof sha !== 'string' || !sha) throw new GitHubApiError('invalid_response', '提交响应缺少 sha');
      return sha;
    },

    async updateRef(owner: string, repo: string, ref: string, sha: string, force = false): Promise<void> {
      await requestJson(`${repoPath(owner, repo)}/git/refs/${ref}`, {
        method: 'PATCH',
        body: JSON.stringify(force ? { sha, force } : { sha })
      });
    },

    async createRepository(name: string, isPrivate: boolean): Promise<GitHubRepoSummary> {
      const json = asRecord(
        await requestJson('/user/repos', { method: 'POST', body: JSON.stringify({ name, private: isPrivate }) })
      );
      return parseRepoSummary(json);
    },

    async getZipball(owner: string, repo: string, ref: string): Promise<Uint8Array> {
      const url = `${apiBase}${repoPath(owner, repo)}/zipball/${encodeURIComponent(ref)}`;
      const token = await getToken();
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+raw',
        'User-Agent': userAgent
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      let response: Response;
      try {
        response = await fetchFn(url, { headers });
      } catch (cause) {
        throw new GitHubApiError('network_failed', '无法连接 GitHub API', undefined, { cause });
      }
      trackQuota(response);
      if (!response.ok) throw await httpError(response);
      return new Uint8Array(await response.arrayBuffer());
    },

    quota(): GitHubQuota {
      return quotaState;
    },

    clearCache(): void {
      cache.clear();
    }
  };
}
