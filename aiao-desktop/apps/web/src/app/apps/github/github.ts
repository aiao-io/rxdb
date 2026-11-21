import { Component, computed, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';

import { DesktopWindow } from '../../services/desktop-window';
import {
  GithubGitBackend,
  type GitBranch,
  type GitCommit,
  type GitFile,
  type GitFileDiff,
  type GitStatus,
  type GitStatusEntry
} from '../../services/github-git-backend';
import {
  GithubRemoteRepository,
  GithubRepositoryStore,
  parseGithubRemote,
  type GithubRepositoryRecord
} from '../../services/github-repository';
import { createGitHubApi, GitHubApi } from '../../services/github/github-api';
import { createGitHubAuth, GitHubAuth } from '../../services/github/github-auth';
import { createIndexedDbSessionStore, createMemorySessionStore } from '../../services/github/github-session-store';
import type { GitHubBranch, GitHubRepoSummary, GitHubSession } from '../../services/github/github-types';
import { TrafficLights } from '../../shared/traffic-lights';

const fatalDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

type GithubTab = 'changes' | 'history';

const ASIDE_WIDTH_MIN = 240;
const ASIDE_WIDTH_MAX = 560;

function bytesOf(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>;
}

function textOf(bytes: Uint8Array): string | null {
  try {
    const value = fatalDecoder.decode(bytes);
    return value.includes('\0') ? null : value;
  } catch {
    return null;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCodeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function projectIdForLocal(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `local-${(slug || 'repository').slice(0, 48)}-${crypto.randomUUID().slice(0, 8)}`;
}

@Component({
  selector: 'app-github',
  imports: [TrafficLights],
  templateUrl: './github.html',
  encapsulation: ViewEncapsulation.None,
  host: {
    style: 'display: contents'
  }
})
export class GithubApp {
  private readonly win = inject(DesktopWindow);
  private readonly store = inject(GithubRepositoryStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly backend = new GithubGitBackend();
  private readonly githubOAuthOrigin = 'https://vscode.aiao.io';
  private readonly exchangeUrl = new URL('/api/github-token', this.githubOAuthOrigin).href;
  private readonly auth: GitHubAuth = createGitHubAuth({
    clientId: () => this.loadClientId(),
    exchangeUrl: this.exchangeUrl,
    redirectUri: new URL('/redirect', this.githubOAuthOrigin).href,
    origin: this.githubOAuthOrigin,
    desktopOrigin: location.origin,
    callbackPath: '/github-callback',
    sessionStore:
      typeof indexedDB === 'undefined' ? createMemorySessionStore() : (
        createIndexedDbSessionStore('aiao-desktop-github-auth')
      )
  });
  private readonly api: GitHubApi = createGitHubApi({
    getToken: async () => (await this.auth.getSession())?.token ?? null
  });
  private readonly remote = new GithubRemoteRepository(this.api);
  private readonly unsubscribeAuth: () => void;
  private currentRevision = 0;
  private readonly storageListener: (event: StorageEvent) => void;

  protected readonly records = this.store.records;
  protected readonly session = signal<GitHubSession | null>(null);
  protected readonly activeRecord = signal<GithubRepositoryRecord | null>(null);
  protected readonly files = signal<readonly GitFile[]>([]);
  protected readonly status = signal<GitStatus | null>(null);
  protected readonly branches = signal<readonly GitBranch[]>([]);
  protected readonly remoteBranches = signal<readonly GitHubBranch[]>([]);
  protected readonly searchResults = signal<readonly GitHubRepoSummary[]>([]);
  protected readonly history = signal<readonly GitCommit[]>([]);
  protected readonly diff = signal<GitFileDiff | null>(null);
  protected readonly selectedPath = signal<string | null>(null);
  protected readonly editorValue = signal('');
  protected readonly tab = signal<GithubTab>('changes');
  protected readonly busy = signal(false);
  protected readonly authBusy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errorCode = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly editorDirty = signal(false);
  protected readonly repoValue = signal('');
  protected readonly branchValue = signal('');
  protected readonly searchValue = signal('');
  protected readonly pendingBranch = signal<string | null>(null);
  protected readonly newRepoValue = signal('');
  protected readonly newBranchValue = signal('');
  protected readonly commitValue = signal('');
  protected readonly patValue = signal('');
  protected readonly repositoryMenuOpen = signal(false);
  protected readonly remoteActionsOpen = signal(false);
  protected readonly asideWidth = signal(320);
  protected readonly lastFetchedAt = signal<number | null>(null);
  protected readonly selectedCommitOid = signal<string | null>(null);

  protected readonly selectedFile = computed(() => {
    const path = this.selectedPath();
    return path ? (this.files().find(file => file.path === path) ?? null) : null;
  });
  protected readonly selectedText = computed(() => {
    const file = this.selectedFile();
    return file ? textOf(file.bytes) : null;
  });
  protected readonly hasChanges = computed(() => (this.status()?.entries.length ?? 0) > 0 || this.editorDirty());
  protected readonly changedEntries = computed(() => this.status()?.entries ?? []);
  protected readonly currentBranch = computed(() => this.status()?.branch ?? this.activeRecord()?.branch ?? 'main');
  protected readonly canDiscardBranch = computed(() => this.errorCode() === 'dirty_workspace');
  protected readonly lastFetchedLabel = computed(() => {
    const timestamp = this.lastFetchedAt();
    return timestamp === null ? 'Never' : (
        new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp)
      );
  });
  protected readonly selectedCommit = computed(() => {
    const selected = this.selectedCommitOid();
    const commits = this.history();
    return commits.find(commit => commit.oid === selected) ?? commits[0] ?? null;
  });

  constructor() {
    this.storageListener = event => {
      if (event.key === 'aiao-desktop-github-session-updated') void this.auth.refresh();
    };
    this.unsubscribeAuth = this.auth.subscribe(session => this.session.set(session));
    addEventListener('storage', this.storageListener);
    this.destroyRef.onDestroy(() => {
      this.unsubscribeAuth();
      removeEventListener('storage', this.storageListener);
      this.backend.dispose();
    });
    void this.restoreLastRepository();
  }

  protected setValue(
    target: 'repo' | 'branch' | 'newRepo' | 'newBranch' | 'commit' | 'pat' | 'search',
    event: Event
  ): void {
    const element = event.target;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
    const value = element.value;
    if (target === 'repo') this.repoValue.set(value);
    if (target === 'branch') this.branchValue.set(value);
    if (target === 'search') this.searchValue.set(value);
    if (target === 'newRepo') this.newRepoValue.set(value);
    if (target === 'newBranch') this.newBranchValue.set(value);
    if (target === 'commit') this.commitValue.set(value);
    if (target === 'pat') this.patValue.set(value);
  }

  protected toggleRepositoryMenu(): void {
    this.repositoryMenuOpen.update(open => !open);
  }

  protected closeRepositoryMenu(): void {
    this.repositoryMenuOpen.set(false);
  }

  protected toggleRemoteActions(): void {
    this.remoteActionsOpen.update(open => !open);
  }

  protected async fetchOrigin(): Promise<void> {
    if (this.activeRecord()?.owner) {
      await this.pull();
      this.lastFetchedAt.set(Date.now());
      return;
    }
    await this.run(async () => {
      await this.refresh();
      this.lastFetchedAt.set(Date.now());
      this.notice.set('Fetched local status');
    });
  }

  protected startAsideResize(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.asideWidth();
    const move = (moveEvent: PointerEvent): void => {
      const next = startWidth + moveEvent.clientX - startX;
      this.asideWidth.set(Math.max(ASIDE_WIDTH_MIN, Math.min(ASIDE_WIDTH_MAX, next)));
    };
    const stop = (): void => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', stop);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', stop);
  }

  protected handleAsideResizeKey(event: KeyboardEvent): void {
    const step = 16;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.asideWidth.update(width => Math.max(ASIDE_WIDTH_MIN, width - step));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.asideWidth.update(width => Math.min(ASIDE_WIDTH_MAX, width + step));
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.asideWidth.set(ASIDE_WIDTH_MIN);
    } else if (event.key === 'End') {
      event.preventDefault();
      this.asideWidth.set(ASIDE_WIDTH_MAX);
    }
  }

  protected async searchRemoteRepositories(): Promise<void> {
    const query = this.searchValue().trim();
    if (!query) {
      this.searchResults.set([]);
      return;
    }
    await this.run(async () => {
      const results = await this.api.searchRepositories(query, 20);
      this.searchResults.set(results);
      this.repositoryMenuOpen.set(true);
      this.notice.set(results.length ? `Found ${results.length} repositories` : 'No repositories found');
    });
  }

  protected async selectRemoteRepository(repository: GitHubRepoSummary): Promise<void> {
    const address = parseGithubRemote(repository.fullName);
    if (!address) return;
    this.repoValue.set(repository.fullName);
    this.branchValue.set('');
    this.searchResults.set([]);
    this.repositoryMenuOpen.set(true);
    await this.loadRemoteBranches();
  }

  protected selectRemoteBranch(event: Event): void {
    const element = event.target;
    if (element instanceof HTMLSelectElement) this.branchValue.set(element.value);
  }

  protected async loadRemoteBranches(): Promise<void> {
    const address = parseGithubRemote(this.repoValue());
    if (!address) {
      this.fail(new Error('请输入有效的 GitHub owner/repo'));
      return;
    }
    await this.run(async () => {
      const repository = await this.api.getRepository(address.owner, address.repo);
      const branches = await this.api.listBranches(address.owner, address.repo);
      this.remoteBranches.set(branches);
      const preferred = this.branchValue().trim() || address.branch || repository.defaultBranch;
      this.branchValue.set(branches.some(branch => branch.name === preferred) ? preferred : repository.defaultBranch);
      this.notice.set(`Loaded ${branches.length} branches`);
    });
  }

  protected setEditor(event: Event): void {
    const element = event.target;
    if (!(element instanceof HTMLTextAreaElement)) return;
    const path = this.selectedPath();
    const file = this.selectedFile();
    if (!path || !file || textOf(file.bytes) === null) return;
    const next = bytesOf(element.value);
    this.files.update(files => files.map(item => (item.path === path ? { ...item, bytes: next } : item)));
    this.editorValue.set(element.value);
    this.editorDirty.set(true);
    this.win.hasUnsavedChanges.set(true);
  }

  protected selectFile(path: string): void {
    if (this.editorDirty() && this.selectedPath() !== path) {
      this.fail(new Error('请先保存当前文件再切换文件'));
      return;
    }
    this.selectedPath.set(path);
    const file = this.files().find(item => item.path === path);
    this.editorValue.set(file ? (textOf(file.bytes) ?? '') : '');
    this.diff.set(null);
  }

  protected async openStored(record: GithubRepositoryRecord): Promise<void> {
    if (!this.ensureEditorSaved()) return;
    await this.run(async () => {
      const snapshot = await this.backend.open(record.projectId);
      this.activeRecord.set(record);
      this.repoValue.set(record.owner && record.repo ? `${record.owner}/${record.repo}` : '');
      this.branchValue.set(record.owner ? record.branch : '');
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.notice.set(`Opened ${record.name}`);
      this.repositoryMenuOpen.set(false);
    });
  }

  protected async createRepository(): Promise<void> {
    if (!this.ensureEditorSaved()) return;
    const name = this.newRepoValue().trim() || 'Untitled Repository';
    const projectId = projectIdForLocal(name);
    await this.run(async () => {
      const initial: GitFile = { path: 'README.md', bytes: bytesOf(`# ${name}\n`) };
      const snapshot = await this.backend.create(projectId, [initial]);
      await this.backend.stage(projectId, [initial.path]);
      await this.backend.commit(projectId, `Create ${name}`);
      const record: GithubRepositoryRecord = {
        projectId,
        name,
        owner: null,
        repo: null,
        branch: 'main',
        private: false,
        remoteHead: null,
        remoteTree: null,
        remoteEntries: [],
        updatedAt: Date.now()
      };
      await this.store.put(record);
      this.activeRecord.set(record);
      this.newRepoValue.set('');
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.repositoryMenuOpen.set(false);
    });
  }

  protected async openRemoteRepository(): Promise<void> {
    if (!this.ensureEditorSaved()) return;
    const address = parseGithubRemote(this.repoValue());
    if (!address) {
      this.fail(new Error('请输入 owner/repo 或 GitHub 仓库地址'));
      return;
    }
    this.repositoryMenuOpen.set(false);
    await this.run(async () => {
      const remote = await this.remote.open(address.owner, address.repo, this.branchValue().trim() || address.branch);
      const existing = this.store.find(remote.record.projectId);
      if (existing) {
        const current = await this.backend.open(existing.projectId);
        const currentStatus = await this.backend.status(existing.projectId);
        if (existing.remoteHead === remote.record.remoteHead) {
          this.activeRecord.set(existing);
          this.repoValue.set(`${remote.record.owner}/${remote.record.repo}`);
          this.branchValue.set(remote.record.branch);
          this.applySnapshot(current.files);
          await this.refresh();
          this.notice.set(`Opened ${remote.record.name}`);
          this.repositoryMenuOpen.set(false);
          return;
        }
        const localDirty = Boolean(currentStatus.entries.length) || this.editorDirty();
        const localFiles = this.editorDirty() ? this.files() : current.files;
        const pulled = await this.remote.pull(existing, localFiles, localDirty, remote);
        await this.replaceFromRemote(existing, pulled, !localDirty);
        return;
      }
      const snapshot = await this.backend.create(remote.record.projectId, remote.files);
      await this.backend.stage(
        remote.record.projectId,
        remote.files.map(file => file.path)
      );
      await this.backend.commit(remote.record.projectId, `Import ${remote.record.name}@${remote.record.branch}`);
      if (remote.record.branch !== 'main') {
        await this.backend.createBranch(remote.record.projectId, remote.record.branch);
        await this.backend.checkout(remote.record.projectId, remote.record.branch);
      }
      await this.store.put(remote.record);
      this.activeRecord.set(remote.record);
      this.repoValue.set(`${remote.record.owner}/${remote.record.repo}`);
      this.branchValue.set(remote.record.branch);
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.repositoryMenuOpen.set(false);
    });
  }

  protected async importRepository(event: Event): Promise<void> {
    if (!this.ensureEditorSaved()) return;
    const element = event.target;
    if (!(element instanceof HTMLInputElement) || !element.files?.length) return;
    const file = element.files[0];
    const name = file.name.replace(/\.(zip|tar)$/i, '') || 'Imported Repository';
    const projectId = projectIdForLocal(name);
    await this.run(async () => {
      const snapshot = await this.backend.importArchive(projectId, new Uint8Array(await file.arrayBuffer()));
      const importedStatus = await this.backend.status(projectId);
      const record: GithubRepositoryRecord = {
        projectId,
        name,
        owner: null,
        repo: null,
        branch: importedStatus.branch,
        private: false,
        remoteHead: null,
        remoteTree: null,
        remoteEntries: [],
        updatedAt: Date.now()
      };
      await this.store.put(record);
      this.activeRecord.set(record);
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.repositoryMenuOpen.set(false);
    });
    element.value = '';
  }

  protected async exportRepository(): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    await this.run(async () => {
      const bytes = await this.backend.exportArchive(record.projectId);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: 'application/zip' })
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${record.name.replace(/[^a-zA-Z0-9._-]+/g, '-')}.zip`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      this.notice.set(`Exported ${record.name}`);
    });
  }

  protected async saveFile(): Promise<void> {
    const record = this.activeRecord();
    const revision = this.status() ? this.currentRevision : null;
    if (!record || revision === null) return;
    await this.run(async () => {
      const snapshot = await this.backend.save(record.projectId, this.files(), revision);
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.editorDirty.set(false);
      this.win.hasUnsavedChanges.set(false);
      this.notice.set('Saved to OPFS');
    });
  }

  protected async removeSelectedFile(): Promise<void> {
    const record = this.activeRecord();
    const path = this.selectedPath();
    if (!record || !path) return;
    await this.run(async () => {
      const snapshot = await this.backend.save(
        record.projectId,
        this.files().filter(file => file.path !== path),
        this.currentRevision,
        [path]
      );
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.notice.set(`Deleted ${path}`);
    });
  }

  protected async stage(path: string): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    await this.run(async () => {
      this.status.set(await this.backend.stage(record.projectId, [path]));
      this.diff.set(null);
    });
  }

  protected async unstage(path: string): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    await this.run(async () => {
      this.status.set(await this.backend.unstage(record.projectId, [path]));
      this.diff.set(null);
    });
  }

  protected async stageAll(): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    await this.run(async () => {
      this.status.set(
        await this.backend.stage(
          record.projectId,
          this.changedEntries().map(entry => entry.path)
        )
      );
      this.diff.set(null);
    });
  }

  protected async discard(path: string): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    await this.run(async () => {
      const snapshot = await this.backend.discardWorking(record.projectId, path);
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.notice.set(`Discarded ${path}`);
    });
  }

  protected async showDiff(path: string, kind: 'working' | 'staged' = 'working'): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    await this.run(async () => this.diff.set(await this.backend.readDiff(record.projectId, path, kind)));
  }

  protected async commit(): Promise<void> {
    const record = this.activeRecord();
    const message = this.commitValue().trim();
    if (!record || !message) return;
    await this.run(async () => {
      const oid = await this.backend.commit(record.projectId, message);
      this.commitValue.set('');
      await this.refresh();
      this.notice.set(`Committed ${oid.slice(0, 8)}`);
    });
  }

  protected async createBranch(): Promise<void> {
    const record = this.activeRecord();
    const branch = this.newBranchValue().trim();
    if (!record || !branch) return;
    await this.run(async () => {
      this.branches.set(await this.backend.createBranch(record.projectId, branch));
      this.newBranchValue.set('');
      this.notice.set(`Created branch ${branch}`);
    });
  }

  protected checkoutFromEvent(event: Event): void {
    const element = event.target;
    if (element instanceof HTMLSelectElement) void this.checkout(element.value);
  }

  protected async checkout(branch: string, force = false): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    if (this.editorDirty()) {
      this.fail(new Error('请先保存当前文件再切换分支'));
      return;
    }
    this.pendingBranch.set(branch);
    await this.run(async () => {
      await this.backend.checkout(record.projectId, branch, force);
      const snapshot = await this.backend.snapshot(record.projectId);
      const next = { ...record, branch, updatedAt: Date.now() };
      await this.store.put(next);
      this.activeRecord.set(next);
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.pendingBranch.set(null);
      this.notice.set(`Switched to ${branch}`);
    });
  }

  protected async restore(oid: string): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    if (this.editorDirty()) {
      this.fail(new Error('请先保存当前文件再恢复提交'));
      return;
    }
    await this.run(async () => {
      const snapshot = await this.backend.restore(record.projectId, oid);
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.notice.set(`Restored ${oid.slice(0, 8)}`);
    });
  }

  protected async pull(): Promise<void> {
    const record = this.activeRecord();
    if (!record?.owner || !record.repo) return;
    await this.run(async () => {
      const localStatus = this.status();
      const current = await this.backend.snapshot(record.projectId);
      const localDirty = Boolean(localStatus?.entries.length) || this.editorDirty();
      const localFiles = this.editorDirty() ? this.files() : current.files;
      const remote = await this.remote.pull(record, localFiles, localDirty);
      if (remote.record.remoteHead === record.remoteHead) {
        this.notice.set('Already up to date');
        return;
      }
      await this.replaceFromRemote(record, remote, !localDirty);
    });
  }

  protected async push(): Promise<void> {
    const record = this.activeRecord();
    if (!record?.owner || !record.repo) return;
    await this.run(async () => {
      if (this.status()?.entries.length || this.editorDirty())
        throw new Error('请先保存并提交本地改动，再推送到 GitHub');
      const snapshot = await this.backend.snapshot(record.projectId);
      const result = await this.remote.push(record, snapshot.files, this.commitValue() || 'Update from Aiao Desktop');
      const entries = (await this.api.getTreeFiles(record.owner!, record.repo!, result.tree)).filter(
        entry => entry.mode !== '160000'
      );
      const next = {
        ...record,
        remoteHead: result.head,
        remoteTree: result.tree,
        remoteEntries: entries,
        updatedAt: Date.now()
      };
      await this.store.put(next);
      this.activeRecord.set(next);
      this.notice.set(`Pushed ${result.head.slice(0, 8)}`);
    });
  }

  protected async loginWithPat(): Promise<void> {
    const token = this.patValue().trim();
    if (!token) return;
    this.authBusy.set(true);
    this.fail(null);
    try {
      await this.auth.loginWithPat(token);
      this.patValue.set('');
      localStorage.setItem('aiao-desktop-github-session-updated', String(Date.now()));
      this.notice.set('Signed in to GitHub');
    } catch (error) {
      this.fail(error);
    } finally {
      this.authBusy.set(false);
    }
  }

  protected async loginWithOAuth(): Promise<void> {
    this.authBusy.set(true);
    this.fail(null);
    let popup: Window | null = null;
    try {
      // 先同步打开占位窗口，避免异步获取 OAuth 配置后失去用户手势。
      const oauthPopup = window.open('about:blank', 'aiao-github-oauth', 'popup,width=600,height=750');
      if (!oauthPopup) throw new Error('浏览器未能打开 GitHub 授权页，请允许弹窗后重试');
      popup = oauthPopup;
      oauthPopup.opener = null;

      const pending = await this.auth.beginOAuth();
      const channel = new BroadcastChannel(`aiao-code.github-oauth:${pending.state}`);
      try {
        const code = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('GitHub 授权超时，请重试')), 120_000);
          const closedTimer = setInterval(() => {
            if (oauthPopup.closed) {
              finish();
              reject(new Error('GitHub 授权窗口已关闭'));
            }
          }, 500);
          const finish = (): void => {
            clearTimeout(timer);
            clearInterval(closedTimer);
          };
          channel.onmessage = (event: MessageEvent<unknown>) => {
            const data = event.data;
            if (typeof data !== 'object' || data === null) return;
            const result = data as { readonly code?: unknown; readonly error?: unknown };
            if (typeof result.code === 'string' && result.code) {
              finish();
              resolve(result.code);
            } else if (typeof result.error === 'string') {
              finish();
              reject(new Error(result.error === 'access_denied' ? '已取消 GitHub 授权' : 'GitHub 授权失败'));
            }
          };
          try {
            oauthPopup.location.replace(pending.authorizeUrl);
          } catch (error) {
            finish();
            reject(error);
          }
        });
        await this.auth.completeOAuth(code, pending.verifier, pending.state);
      } finally {
        channel.close();
      }
      localStorage.setItem('aiao-desktop-github-session-updated', String(Date.now()));
      this.notice.set('Signed in to GitHub');
    } catch (error) {
      this.fail(error);
    } finally {
      if (popup && !popup.closed) popup.close();
      this.authBusy.set(false);
    }
  }

  protected async logout(): Promise<void> {
    this.authBusy.set(true);
    try {
      await this.auth.logout();
      localStorage.setItem('aiao-desktop-github-session-updated', String(Date.now()));
      this.notice.set('Signed out of GitHub');
    } catch (error) {
      this.fail(error);
    } finally {
      this.authBusy.set(false);
    }
  }

  protected fileText(file: GitFile): string | null {
    return textOf(file.bytes);
  }

  protected statusLabelForPath(path: string): string {
    const entry = this.changedEntries().find(item => item.path === path);
    return entry ? this.statusLabel(entry).slice(0, 1) : '';
  }

  protected statusEntryForPath(path: string): GitStatusEntry | null {
    return this.changedEntries().find(entry => entry.path === path) ?? null;
  }

  protected statusLabel(entry: GitStatusEntry): string {
    if (entry.index === '?' && entry.worktree === '?') return 'Untracked';
    if (entry.index !== ' ') return 'Staged';
    return 'Changed';
  }

  protected isStaged(entry: GitStatusEntry): boolean {
    return entry.index !== ' ' && entry.index !== '?';
  }

  protected closeDiff(): void {
    this.diff.set(null);
  }

  protected setTab(tab: GithubTab): void {
    this.tab.set(tab);
    this.diff.set(null);
  }

  protected selectCommit(oid: string): void {
    this.selectedCommitOid.set(oid);
  }

  private async restoreLastRepository(): Promise<void> {
    await this.store.ready();
    const record = this.records()[0];
    if (record) await this.openStored(record);
  }

  private async refresh(): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    const [status, branches, history] = await Promise.all([
      this.backend.status(record.projectId),
      this.backend.branches(record.projectId),
      this.backend.history(record.projectId)
    ]);
    this.status.set(status);
    this.branches.set(branches);
    this.history.set(history);
    this.currentRevision = (await this.backend.snapshot(record.projectId)).revision;
    this.win.title.set(`GitHub · ${record.name}`);
  }

  private applySnapshot(files: readonly GitFile[]): void {
    this.files.set(files);
    const selected = this.selectedPath();
    const path = selected && files.some(file => file.path === selected) ? selected : (files[0]?.path ?? null);
    this.selectedPath.set(path);
    const file = path ? files.find(item => item.path === path) : null;
    this.editorValue.set(file ? (textOf(file.bytes) ?? '') : '');
    this.editorDirty.set(false);
    this.win.hasUnsavedChanges.set(false);
  }

  private async replaceFromRemote(
    record: GithubRepositoryRecord,
    remote: { readonly record: GithubRepositoryRecord; readonly files: readonly GitFile[] },
    cleanBaseline: boolean
  ): Promise<void> {
    const current = await this.backend.snapshot(record.projectId);
    const remotePaths = new Set(remote.files.map(file => file.path));
    const removedPaths = current.files.filter(file => !remotePaths.has(file.path)).map(file => file.path);
    const snapshot = await this.backend.save(record.projectId, remote.files, current.revision, removedPaths);
    if (cleanBaseline) {
      const changed = await this.backend.status(record.projectId);
      if (changed.entries.length) {
        await this.backend.stage(
          record.projectId,
          changed.entries.map(entry => entry.path)
        );
        await this.backend.commit(record.projectId, `Pull ${remote.record.name}@${remote.record.branch}`);
      }
    }
    await this.store.put(remote.record);
    this.activeRecord.set(remote.record);
    this.repoValue.set(remote.record.owner && remote.record.repo ? `${remote.record.owner}/${remote.record.repo}` : '');
    this.branchValue.set(remote.record.owner ? remote.record.branch : '');
    this.applySnapshot(snapshot.files);
    await this.refresh();
    this.notice.set(`Pulled ${remote.record.name}`);
  }

  private async run(task: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.fail(null);
    try {
      await task();
    } catch (error) {
      this.fail(error);
      if (errorCodeOf(error) === 'storage_failed') this.backend.restart();
    } finally {
      this.busy.set(false);
    }
  }

  private fail(error: unknown): void {
    this.error.set(error === null ? null : messageOf(error));
    this.errorCode.set(error === null ? null : errorCodeOf(error));
  }

  private ensureEditorSaved(): boolean {
    if (!this.editorDirty()) return true;
    this.fail(new Error('请先保存当前文件再切换仓库'));
    return false;
  }

  private async loadClientId(): Promise<string> {
    const response = await fetch(this.exchangeUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`GitHub 登录配置不可用（HTTP ${response.status}）`);
    const value = (await response.json()) as { readonly clientId?: unknown };
    if (typeof value.clientId !== 'string' || !value.clientId.trim()) throw new Error('GitHub 登录配置缺少 clientId');
    return value.clientId.trim();
  }
}
