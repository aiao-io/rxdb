import {
  afterRenderEffect,
  ApplicationRef,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  NgZone,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation
} from '@angular/core';
import {
  LucideArrowDown as ArrowDown,
  LucideArrowUp as ArrowUp,
  LucideGitBranch as BranchIcon,
  LucideCheck as Check,
  LucideChevronDown as ChevronDown,
  LucideChevronsUpDown as ChevronsUpDown,
  LucideCopy as Copy,
  LucideFileDiff as FileDiff,
  LucideFilter as Filter,
  LucideFolder as Folder,
  LucideGitCommitHorizontal as GitCommitHorizontal,
  LucideDynamicIcon,
  LucideMonitor as Monitor,
  LucideMoreVertical as MoreVertical,
  LucideRefreshCw as RefreshCw,
  LucideSearch as Search,
  LucideServer as Server,
  LucideSettings as Settings,
  LucideSettings2 as Settings2,
  LucideSquareDot as SquareDot,
  LucideSquareMinus as SquareMinus,
  LucideSquarePlus as SquarePlus,
  LucideTrash2 as Trash2,
  LucideUpload as Upload,
  LucideUserPlus as UserPlus,
  LucideUsersRound as UsersRound
} from '@lucide/angular';

import { finderPathOf, HOME, isWithin, resolveVmPath, samePath, toVmPath } from '../../disk/disk-path';
import { Preferences } from '../../data/preferences';
import { DesktopAppServices } from '../../services/desktop-app-services';
import {
  DesktopMenus,
  type GithubExternalTarget,
  type GithubRepositoryMenu,
  type GithubTab
} from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { FileSystem } from '../../services/file-system';
import { archiveOfDirectory, archiveOfUploadedDirectory, type SourceDirectory } from '../../services/git/git-directory';
import type { GitHistoryComparison } from '../../services/git/git-protocol';
import {
  type GitBranch,
  type GitCommit,
  type GitCommitFileChange,
  type GitFile,
  type GitFileDiff,
  type GitFileVersion,
  type GitStatus,
  type GitStatusEntry
} from '../../services/github-git-backend';
import { branchBaseOf, parseGithubRemote, type GithubRepositoryRecord } from '../../services/github-repository';
import { GithubWorkspace } from '../../services/github-workspace';
import type { GitHubOAuthRequest } from '../../services/github/github-auth';
import type { GitHubBranch, GitHubRepoSummary, GitHubSession } from '../../services/github/github-types';
import { PopoverService, RETURNS_FOCUS } from '../../services/popover';
import { SystemState } from '../../services/system-state';
import { WindowManager } from '../../services/window-manager';
import { FocusTrap } from '../../shared/focus-trap';
import { TrafficLights } from '../../shared/traffic-lights';
import {
  APPEARANCE_KEY, DEFAULT_APPEARANCE, formatGithubDate, formatGithubNumber, formatGithubTime,
  isGithubAppearance, type GithubAppearance
} from './github-appearance';
import { GithubSettings } from './github-settings';
import { historyDiffRows, type GithubDiffLine } from './history-diff';
import { syncActionOf, type GithubSyncAction } from './sync-action';

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const syncTimeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

type GithubSyncOperation = Exclude<GithubSyncAction, 'detached'>;

const syncLabels = {
  refresh: 'Refresh status',
  fetch: 'Fetch origin',
  pull: 'Pull origin',
  push: 'Push origin',
  publish: 'Publish branch',
  detached: 'Detached HEAD'
} as const;

const syncProgress = {
  refresh: 'Refreshing status…',
  fetch: 'Fetching origin…',
  pull: 'Pulling origin…',
  push: 'Pushing origin…',
  publish: 'Publishing branch…'
} as const;

const syncIcons = {
  refresh: RefreshCw,
  fetch: RefreshCw,
  pull: ArrowDown,
  push: ArrowUp,
  publish: Upload,
  detached: BranchIcon
};

const fatalDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

type GithubChangeKind = 'all' | 'added' | 'modified' | 'deleted';

interface GithubDiffValue {
  readonly base: GitFileVersion;
  readonly modified: GitFileVersion;
}

interface GithubDiffHunk {
  readonly label: string;
  readonly lines: readonly GithubDiffLine[];
}

type DirectoryPicker = () => Promise<SourceDirectory>;

interface DirectoryPickerWindow extends Window {
  readonly showDirectoryPicker?: DirectoryPicker;
}

type DroppedFileHandle = SourceDirectory | { readonly kind: 'file'; readonly name: string };

interface SystemRepositoryFolder {
  readonly name: string;
  archive(): Promise<{ name: string; archive: Uint8Array<ArrayBuffer> }>;
}

function droppedDirectory(result: PromiseSettledResult<DroppedFileHandle | null | undefined>): SourceDirectory {
  if (result.status === 'rejected') throw result.reason;
  if (result.value === undefined) throw new Error('此浏览器不支持拖入系统目录。请使用 Add Local Repository 选择目录');
  if (result.value?.kind !== 'directory') throw new Error('请选择 Git 仓库文件夹');
  return result.value;
}

function systemFolderOf(directory: SourceDirectory): SystemRepositoryFolder {
  return { name: directory.name, archive: () => archiveOfDirectory(directory) };
}

type GithubContextMenuTarget =
  { readonly kind: 'file'; readonly path: string } | { readonly kind: 'branch'; readonly name: string };

type GithubContextMenu = GithubContextMenuTarget & { readonly x: number; readonly y: number };

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

async function waitForOAuthCode(popup: Window, request: GitHubOAuthRequest, signal: AbortSignal): Promise<string> {
  const channel = new BroadcastChannel(`aiao-code.github-oauth:${request.state}`);
  const lifetime = new AbortController();
  try {
    return await new Promise<string>((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { signal: lifetime.signal });
      channel.onmessage = ({ data }: MessageEvent<unknown>) => {
        if (!data || typeof data !== 'object') return;
        if ('code' in data && typeof data.code === 'string' && data.code) resolve(data.code);
        else if ('error' in data) reject(new Error(data.error === 'access_denied' ? '已取消 GitHub 授权' : 'GitHub 授权失败'));
      };
      // COOP 会断开跨域窗口引用；导航后不能用 popup.closed 判断用户是否关闭了窗口。
      popup.location.replace(request.authorizeUrl);
    });
  } finally {
    lifetime.abort();
    channel.close();
  }
}

function errorCodeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function linesOf(text: string | null): readonly string[] {
  if (!text) return [];
  const lines = text.split('\n');
  return lines.length > 1 && lines.at(-1) === '' ? lines.slice(0, -1) : lines;
}

function diffLinesOf(value: GithubDiffValue | null, ignoreWhitespace = false): readonly GithubDiffLine[] {
  if (!value || value.base.binary || value.modified.binary) return [];
  const oldLines = linesOf(value.base.text);
  const newLines = linesOf(value.modified.text);
  const compare = (text: string) => text.replace(/\s+/g, '');
  const oldContent = ignoreWhitespace ? oldLines.map(compare) : oldLines;
  const newContent = ignoreWhitespace ? newLines.map(compare) : newLines;
  const max = oldLines.length + newLines.length;
  const trace: Map<number, number>[] = [];
  let frontier = new Map<number, number>([[0, 0]]);

  for (let distance = 0; distance <= max; distance++) {
    trace.push(frontier);
    const next = new Map<number, number>();
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down =
        diagonal === -distance ||
        (diagonal !== distance && (frontier.get(diagonal - 1) ?? -1) < (frontier.get(diagonal + 1) ?? -1));
      let oldIndex = down ? (frontier.get(diagonal + 1) ?? 0) : (frontier.get(diagonal - 1) ?? 0) + 1;
      let newIndex = oldIndex - diagonal;
      while (
        oldIndex < oldLines.length &&
        newIndex < newLines.length &&
        oldContent[oldIndex] === newContent[newIndex]
      ) {
        oldIndex++;
        newIndex++;
      }
      next.set(diagonal, oldIndex);
      if (oldIndex >= oldLines.length && newIndex >= newLines.length) {
        return buildDiffLines(oldLines, newLines, trace, distance);
      }
    }
    frontier = next;
  }

  return [];
}

function buildDiffLines(
  oldLines: readonly string[],
  newLines: readonly string[],
  trace: readonly Map<number, number>[],
  finalDistance: number
): readonly GithubDiffLine[] {
  let oldIndex = oldLines.length;
  let newIndex = newLines.length;
  const result: GithubDiffLine[] = [];

  for (let distance = finalDistance; distance > 0; distance--) {
    const diagonal = oldIndex - newIndex;
    const previous = trace[distance];
    const down =
      diagonal === -distance ||
      (diagonal !== distance && (previous.get(diagonal - 1) ?? -1) < (previous.get(diagonal + 1) ?? -1));
    const previousDiagonal = down ? diagonal + 1 : diagonal - 1;
    const previousOldIndex = previous.get(previousDiagonal) ?? 0;
    const previousNewIndex = previousOldIndex - previousDiagonal;

    while (oldIndex > previousOldIndex && newIndex > previousNewIndex) {
      result.push({
        oldNumber: oldIndex,
        newNumber: newIndex,
        oldText: oldLines[oldIndex - 1],
        newText: newLines[newIndex - 1],
        same: true
      });
      oldIndex--;
      newIndex--;
    }

    if (oldIndex === previousOldIndex) {
      result.push({
        oldNumber: null,
        newNumber: newIndex,
        oldText: null,
        newText: newLines[newIndex - 1],
        same: false
      });
      newIndex--;
    } else {
      result.push({
        oldNumber: oldIndex,
        newNumber: null,
        oldText: oldLines[oldIndex - 1],
        newText: null,
        same: false
      });
      oldIndex--;
    }
  }

  while (oldIndex > 0 && newIndex > 0) {
    result.push({
      oldNumber: oldIndex,
      newNumber: newIndex,
      oldText: oldLines[oldIndex - 1],
      newText: newLines[newIndex - 1],
      same: true
    });
    oldIndex--;
    newIndex--;
  }

  return result.reverse();
}

function diffRange(lines: readonly GithubDiffLine[], side: 'oldNumber' | 'newNumber'): string {
  const numbers = lines.flatMap(line => (line[side] === null ? [] : [line[side]]));
  const start = numbers[0] ?? 0;
  return numbers.length === 1 ? `${start}` : `${start},${numbers.length}`;
}

function diffHunksOf(lines: readonly GithubDiffLine[]): readonly GithubDiffHunk[] {
  const ranges: { start: number; end: number }[] = [];
  for (const [index, line] of lines.entries()) {
    if (line.same) continue;
    const start = Math.max(0, index - 3);
    const end = Math.min(lines.length, index + 4);
    const previous = ranges.at(-1);
    if (previous && start <= previous.end) previous.end = end;
    else ranges.push({ start, end });
  }
  return ranges.map(({ start, end }) => {
    const context = lines.slice(start, end);
    return { lines: context, label: `@@ -${diffRange(context, 'oldNumber')} +${diffRange(context, 'newNumber')} @@` };
  });
}

@Component({
  selector: 'app-github',
  imports: [FocusTrap, GithubSettings, TrafficLights, LucideDynamicIcon],
  templateUrl: './github.html',
  encapsulation: ViewEncapsulation.None,
  host: {
    style: 'display: contents'
  }
})
export class GithubApp {
  private readonly win = inject(DesktopWindow);
  private readonly wm = inject(WindowManager);
  private readonly menus = inject(DesktopMenus);
  private readonly preferences = inject(Preferences);
  private readonly savedAppearance = computed(() => this.preferences.get(APPEARANCE_KEY, isGithubAppearance) ?? DEFAULT_APPEARANCE);
  private readonly system = inject(SystemState);
  private readonly applicationRef = inject(ApplicationRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  private readonly destroyRef = inject(DestroyRef);
  private readonly backend = inject(DesktopAppServices).get(GithubWorkspace);
  private readonly store = this.backend.records;
  private readonly connection = this.backend.connection;
  private readonly auth = this.connection.auth;
  private readonly api = this.connection.api;
  private readonly remote = this.connection.remote;
  private readonly unsubscribeAuth: () => void;
  private currentRevision = 0;
  private operation = 0;
  private externalRefreshPending = false;
  private externalRefreshing = false;
  private historyLoadRequest = 0;
  private comparisonRequest = 0;
  private comparisonKey: string | null = null;
  private historyProjectId: string | null = null;
  private restorePromise: Promise<void> | null = null;
  private readonly storageListener: (event: StorageEvent) => void;
  private readonly popover = inject(PopoverService);
  private readonly commitMessageInput = viewChild<ElementRef<HTMLInputElement>>('commitMessageInput');
  private readonly repositoryInput = viewChild<ElementRef<HTMLElement>>('repositoryInput');
  private readonly repositoryFilterInput = viewChild<ElementRef<HTMLElement>>('repositoryFilterInput');
  private readonly newRepositoryInput = viewChild<ElementRef<HTMLElement>>('newRepositoryInput');
  private readonly localRepositoryInput = viewChild<ElementRef<HTMLInputElement>>('localRepositoryInput');
  private readonly worktreeInput = viewChild<ElementRef<HTMLInputElement>>('worktreeFilterInput');
  private readonly branchInput = viewChild<ElementRef<HTMLElement>>('branchFilterInput');
  private readonly newBranchInput = viewChild<ElementRef<HTMLElement>>('newBranchInput');
  private readonly repositoryMenuFocus = signal<GithubRepositoryMenu | null>(null);
  private readonly branchMenuFocus = signal(false);
  private readonly changesFilterFocus = signal(false);
  private readonly lastLocalRefresh = signal<{ readonly projectId: string; readonly at: number } | null>(null);

  private readonly changeFilterInput = viewChild<ElementRef<HTMLInputElement>>('changeFilterInput');
  private readonly historyLineHunks = computed(() =>
    diffHunksOf(diffLinesOf(this.historyDiff(), this.ignoreHistoryWhitespace()))
  );

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
  protected readonly historyChanges = signal<readonly GitCommitFileChange[]>([]);
  protected readonly historyDiff = signal<GitCommitFileChange | null>(null);
  protected readonly historyDetailsExpanded = signal(false);
  protected readonly historyDiffSettingsOpen = signal(false);
  protected readonly sideBySideHistory = signal(localStorage.getItem('aiao-desktop-diff-side-by-side') === 'true');
  protected readonly ignoreHistoryWhitespace = signal(false);
  protected readonly compareBranch = signal<string | null>(null);
  protected readonly comparison = signal<GitHistoryComparison | null>(null);
  protected readonly compareDirection = signal<'ahead' | 'behind'>('ahead');
  protected readonly compareBranches = computed(() => this.branches().filter(branch => branch.oid && !branch.current));
  protected readonly visibleHistory = computed(() => {
    const result = this.comparison();
    if (!this.compareBranch()) return this.history();
    if (!result) return [];
    return this.compareDirection() === 'ahead' ? result.aheadCommits : result.behindCommits;
  });
  protected readonly selectedHistoryPath = signal<string | null>(null);
  protected readonly selectedPath = signal<string | null>(null);
  protected readonly editorValue = signal('');
  protected readonly tab = signal<GithubTab>('changes');
  protected readonly busy = signal(false);
  protected readonly syncing = signal<GithubSyncOperation | null>(null);
  protected readonly syncMenuOpen = signal(false);
  protected readonly authBusy = signal(false);
  protected readonly authError = signal<string | null>(null);
  protected readonly oauthAttempt = signal<AbortController | null>(null);
  protected readonly settingsDraft = signal<GithubAppearance | null>(null);
  protected readonly settingsSaving = signal(false);
  protected readonly settingsError = signal<string | null>(null);
  protected readonly settingsId = `github-app-settings-${this.win.id}`;
  protected readonly appTheme = computed(() => {
    const theme = (this.settingsDraft() ?? this.savedAppearance()).theme;
    return theme === 'system' ? this.system.theme() : theme;
  });
  protected readonly diffTabSize = computed(() => (this.settingsDraft() ?? this.savedAppearance()).tabSize);
  protected readonly showWorktree = computed(() => this.activeRecord() !== null && this.savedAppearance().alwaysShowWorktree);
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
  protected readonly commitDescription = signal('');
  protected readonly patValue = signal('');
  protected readonly repositoryMenuOpen = signal(false);
  protected readonly repositoryPanel = signal<GithubRepositoryMenu>('list');
  protected readonly localRepositoryOpen = computed(
    () => this.repositoryMenuOpen() && this.repositoryPanel() === 'local'
  );
  protected readonly repositorySettings = signal<{ readonly projectId: string; readonly origin: string | null } | null>(
    null
  );
  protected readonly remoteDraft = signal<string | null>('');
  protected readonly repositoryModalOpen = computed(() => !!this.settingsDraft() || this.localRepositoryOpen() || !!this.repositorySettings());
  protected readonly repositorySettingsTitleId = `github-settings-title-${this.win.id}`;
  protected readonly remoteUrlId = `github-settings-remote-${this.win.id}`;
  protected readonly remoteErrorId = `github-settings-error-${this.win.id}`;
  protected readonly localRepositoryTitleId = `github-local-title-${this.win.id}`;
  protected readonly localRepositoryPathId = `github-local-path-${this.win.id}`;
  protected readonly localRepositoryErrorId = `github-local-error-${this.win.id}`;
  protected readonly localRepositoryPath = signal('');
  protected readonly localSystemFolder = signal<SystemRepositoryFolder | null>(null);
  protected readonly canInitializeLocalRepository = computed(
    () => !this.localSystemFolder() && this.errorCode() === 'project_missing'
  );
  protected readonly addRepositoryMenuOpen = signal(false);
  protected readonly repositoryFilter = signal('');
  protected readonly filteredRepositories = computed(() => {
    const query = this.repositoryFilter().trim().toLowerCase();
    return this.records().filter(record => record.name.toLowerCase().includes(query));
  });
  protected readonly repositoryGroups = computed(() => {
    const records = this.filteredRepositories();
    return [
      { label: 'GitHub', records: records.filter(record => record.owner !== null) },
      { label: 'Other', records: records.filter(record => record.owner === null) }
    ].filter(group => group.records.length);
  });
  protected readonly worktreeMenuOpen = signal(false);
  protected readonly branchMenuOpen = signal(false);
  protected readonly createBranchOpen = signal(false);
  protected readonly branchFilter = signal('');
  protected readonly worktreeFilter = signal('');
  protected readonly changeFilter = signal('');
  protected readonly changeKind = signal<GithubChangeKind>('all');
  protected readonly changeKindOpen = signal(false);
  protected readonly contextMenu = signal<GithubContextMenu | null>(null);
  protected readonly changeKinds: readonly GithubChangeKind[] = ['all', 'added', 'modified', 'deleted'];
  protected readonly asideWidth = signal(250);
  protected readonly worktreeWidth = signal(230);
  protected readonly branchWidth = signal(230);
  protected readonly showCleanFiles = signal(false);
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
  protected readonly currentWorktree = computed(() => this.activeRecord()?.name ?? 'No repository');
  protected readonly cleanRepository = computed(() => !this.hasChanges() && !this.showCleanFiles());
  protected readonly canDiscardBranch = computed(() => this.errorCode() === 'dirty_workspace');
  protected readonly syncAction = computed(() => syncActionOf(this.activeRecord(), this.status()));
  protected readonly syncHasOptions = computed(() => ['pull', 'push', 'publish'].includes(this.syncAction()));
  protected readonly syncTitle = computed(() => {
    const operation = this.syncing();
    return operation ? syncProgress[operation] : syncLabels[this.syncAction()];
  });
  protected readonly syncIcon = computed(() => (this.syncing() ? RefreshCw : syncIcons[this.syncAction()]));
  protected readonly syncSubtitle = computed(() => {
    if (this.syncing()) return 'Hang on…';
    if (this.syncAction() === 'detached') return 'Switch to a branch to sync';
    const record = this.activeRecord();
    if (!record) return 'No repository';
    if (record.owner && record.repo) {
      const time = record.lastFetchedAt;
      return time === undefined ? 'Never fetched' : `Last fetched ${syncTimeFormat.format(time)}`;
    }
    const local = this.lastLocalRefresh();
    return local?.projectId === record.projectId ?
        `Last refreshed ${syncTimeFormat.format(local.at)}`
      : 'Local repository';
  });
  protected readonly selectedCommit = computed<GitCommit | null>(() => {
    const selected = this.selectedCommitOid();
    const commits = this.visibleHistory();
    return commits.find(commit => commit.oid === selected) ?? commits[0] ?? null;
  });
  protected readonly filteredEntries = computed(() => {
    const needle = this.changeFilter().trim().toLowerCase();
    const kind = this.changeKind();
    return this.changedEntries().filter(entry => {
      const matchesText = entry.path.toLowerCase().includes(needle);
      const matchesKind = kind === 'all' || this.changeKindFor(entry) === kind;
      return matchesText && matchesKind;
    });
  });
  protected readonly visibleFiles = computed(() => {
    const entries = this.changedEntries();
    if (!entries.length) return this.showCleanFiles() ? this.files() : [];
    const paths = new Set(this.filteredEntries().map(entry => entry.path));
    return this.files().filter(file => paths.has(file.path));
  });
  protected readonly filteredBranches = computed(() => {
    const needle = this.branchFilter().trim().toLowerCase();
    return this.branches().filter(branch => branch.name.toLowerCase().includes(needle));
  });
  protected readonly diffHunks = computed(() => diffHunksOf(diffLinesOf(this.diff())));
  protected readonly historyDiffHunks = computed(() => {
    const split = this.sideBySideHistory();
    return this.historyLineHunks().map(hunk => ({
      label: hunk.label,
      lines: historyDiffRows(hunk.lines, split)
    }));
  });
  protected readonly historyStats = computed(() => {
    let additions = 0;
    let deletions = 0;
    for (const change of this.historyChanges()) {
      for (const line of diffLinesOf(change)) {
        if (line.same) continue;
        if (line.newText !== null) additions++;
        if (line.oldText !== null) deletions++;
      }
    }
    return { additions, deletions };
  });

  protected readonly Check = Check;
  protected readonly ChevronDown = ChevronDown;
  protected readonly ChevronsUpDown = ChevronsUpDown;
  protected readonly Copy = Copy;
  protected readonly FileDiff = FileDiff;
  protected readonly Filter = Filter;
  protected readonly Folder = Folder;
  protected readonly GitBranch = BranchIcon;
  protected readonly GitCommitHorizontal = GitCommitHorizontal;
  protected readonly Monitor = Monitor;
  protected readonly MoreVertical = MoreVertical;
  protected readonly Search = Search;
  protected readonly Server = Server;
  protected readonly Settings = Settings;
  protected readonly Settings2 = Settings2;
  protected readonly Trash2 = Trash2;
  protected readonly UserPlus = UserPlus;
  protected readonly UsersRound = UsersRound;
  protected readonly historyStatusIcons = { added: SquarePlus, modified: SquareDot, deleted: SquareMinus } as const;

  constructor() {
    this.win.setMenus(computed(() => this.menuSections()));
    const changes = this.backend.changes.subscribe(id => {
      if (this.activeRecord()?.projectId === id) this.reloadExternal();
    });
    const diskChanges = inject(FileSystem).changes.subscribe(({ paths }) => {
      const root = this.activeRecord()?.rootPath;
      if (root && paths.some(path => isWithin(path, root) || isWithin(root, path))) this.reloadExternal();
    });
    this.destroyRef.onDestroy(() => {
      changes.unsubscribe();
      diskChanges.unsubscribe();
      if (this.syncMenuOpen()) this.popover.close(true);
    });
    effect(() => {
      if (this.syncMenuOpen() && (this.busy() || !this.syncHasOptions() || this.repositoryModalOpen()))
        this.popover.close(true);
    });
    effect(() => {
      const front = this.wm.focused() === this.win;
      if (front) untracked(() => this.reloadExternal());
    });
    afterRenderEffect(() => this.worktreeInput()?.nativeElement.focus());
    afterRenderEffect(() => {
      const repositoryFocus = this.repositoryMenuFocus();
      const branchFocus = this.branchMenuFocus();
      if (this.repositoryMenuOpen() && repositoryFocus) {
        let focusTarget: ElementRef<HTMLElement> | undefined;
        if (repositoryFocus === 'list') focusTarget = this.repositoryFilterInput();
        if (repositoryFocus === 'clone') focusTarget = this.repositoryInput();
        if (repositoryFocus === 'new') focusTarget = this.newRepositoryInput();
        if (focusTarget) focusTarget.nativeElement.focus();
        untracked(() => this.repositoryMenuFocus.set(null));
      }
      if (this.branchMenuOpen() && branchFocus) {
        const input = this.branchInput();
        if (input) input.nativeElement.focus();
        untracked(() => this.branchMenuFocus.set(false));
      }
      if (this.createBranchOpen()) this.newBranchInput()?.nativeElement.focus();
      if (this.changesFilterFocus()) {
        const input = this.changeFilterInput();
        if (input) input.nativeElement.focus();
        untracked(() => this.changesFilterFocus.set(false));
      }
    });
    this.storageListener = event => {
      if (event.key === 'aiao-desktop-github-session-updated') void this.auth.refresh();
    };
    this.unsubscribeAuth = this.auth.subscribe(session => this.session.set(session));
    addEventListener('storage', this.storageListener);
    this.destroyRef.onDestroy(() => {
      this.unsubscribeAuth();
      removeEventListener('storage', this.storageListener);
      this.cancelOAuth();
    });
    void this.restoreLastRepository().catch(error => this.fail(error));
  }

  protected setValue(
    target:
      | 'repo'
      | 'branch'
      | 'newRepo'
      | 'newBranch'
      | 'commit'
      | 'commitDescription'
      | 'pat'
      | 'search'
      | 'branchFilter'
      | 'worktreeFilter'
      | 'repositoryFilter'
      | 'changeFilter',
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
    if (target === 'commitDescription') this.commitDescription.set(value);
    if (target === 'pat') this.patValue.set(value);
    if (target === 'branchFilter') this.branchFilter.set(value);
    if (target === 'worktreeFilter') this.worktreeFilter.set(value);
    if (target === 'repositoryFilter') this.repositoryFilter.set(value);
    if (target === 'changeFilter') this.changeFilter.set(value);
  }

  protected openLocalRepository(): void {
    this.openRepositoryMenu('local');
  }

  protected openRepositoryInEditor(): void {
    const record = this.activeRecord();
    if (!record) return;
    this.showCleanFiles.set(true);
    const path = this.selectedPath() ?? this.files()[0]?.path ?? null;
    if (path) this.openFile(path);
    this.wm.open('vscode', { projectId: record.projectId, workspaceName: record.name });
  }

  protected async openRepositoryInTerminal(): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    await this.run(async () => {
      const cwd = await this.backend.workingDirectory(record.projectId);
      if (this.destroyRef.destroyed) return;
      this.activeRecord.set(this.store.find(record.projectId) ?? record);
      this.wm.open('terminal', { cwd, force: true });
    });
  }

  protected showRepositoryInFinder(): void {
    if (!this.activeRecord()) return;
    const root = this.activeRecord()?.rootPath;
    this.wm.open('finder', root ? { path: finderPathOf(root), force: true } : {});
  }

  protected setRemoteDraft(url: string | null): void {
    this.remoteDraft.set(url);
    this.fail(null);
  }

  protected cancelRepositorySettings(event?: Event): void {
    event?.stopPropagation();
    if (this.busy()) return;
    this.fail(null);
    this.repositorySettings.set(null);
  }

  protected async saveRepositorySettings(event: Event): Promise<void> {
    event.preventDefault();
    const settings = this.repositorySettings();
    const url = this.remoteDraft()?.trim() ?? null;
    if (!settings || this.busy() || url === '') return;
    await this.run(async () => {
      if (url !== settings.origin) {
        const current = this.activeRecord();
        const next = await this.backend.configureRemote(settings.projectId, url, settings.origin);
        if (this.destroyRef.destroyed) return;
        this.activeRecord.set(next);
        this.repoValue.set(next.owner && next.repo ? `${next.owner}/${next.repo}` : '');
        if (current?.owner !== next.owner || current?.repo !== next.repo) {
          this.branchValue.set(next.owner ? this.currentBranch() : '');
          this.remoteBranches.set([]);
          this.lastLocalRefresh.set(null);
        }
      }
      this.repositorySettings.set(null);
    });
  }

  protected async droppedDiskFolder(event: Event): Promise<void> {
    if (!(event instanceof CustomEvent) || !this.canDropRepository()) return;
    const path: unknown = event.detail;
    if (!Array.isArray(path) || !path.every(part => typeof part === 'string')) return;
    this.focusDropTarget();
    if (!this.ensureEditorSaved()) return;
    await this.run(async () => {
      const root = await this.backend.localDirectoryRoot(path);
      const existing = await this.backend.repositoryAt(root);
      if (this.destroyRef.destroyed) return;
      if (existing?.rootPath && samePath(root, existing.rootPath)) {
        await this.loadStoredRepository(existing);
        this.closeRepositoryMenu();
        return;
      }
      this.openRepositoryMenu('local');
      this.localRepositoryPath.set(toVmPath(root));
    });
  }

  protected setLocalRepositoryPath(value: string): void {
    this.localRepositoryPath.set(value);
    this.fail(null);
  }

  protected clearLocalSystemFolder(): void {
    this.localSystemFolder.set(null);
    this.fail(null);
  }

  protected async addLocalRepository(event?: Event, initialize = false): Promise<void> {
    event?.preventDefault();
    const system = this.localSystemFolder();
    const value = this.localRepositoryPath();
    if ((!system && !value.trim()) || this.busy() || !this.ensureEditorSaved()) return;
    await this.run(async () => {
      if (system) {
        await this.importSystemFolder(system);
      } else {
        const path = value.startsWith('~/') ? resolveVmPath(HOME, value.slice(2)) : resolveVmPath([], value);
        const root = await this.backend.localDirectoryRoot(path);
        await this.loadStoredRepository(await this.backend.openDirectory(root, { initialize, requireExisting: true }));
      }
      this.closeRepositoryMenu();
    });
  }

  protected cancelLocalRepository(event?: Event): void {
    event?.stopPropagation();
    if (this.busy()) return;
    this.fail(null);
    this.closeRepositoryMenu();
  }

  protected foldersOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = this.canDropRepository() ? 'copy' : 'none';
  }

  protected async dropFolders(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (!this.canDropRepository() || !event.dataTransfer) return;
    // 浏览器只允许在 drop 回调首次 await 之前取得句柄。
    const items = Array.from(event.dataTransfer.items).filter(item => item.kind === 'file');
    const handles = items.map(item =>
      (
        item as DataTransferItem & {
          getAsFileSystemHandle?(): Promise<DroppedFileHandle | null>;
        }
      ).getAsFileSystemHandle?.()
    );
    if (!handles.length) return;
    const results = await Promise.allSettled(handles);
    if (!this.canDropRepository()) return;
    this.focusDropTarget();
    if (!this.ensureEditorSaved()) return;
    if (results.length === 1) {
      try {
        const directory = droppedDirectory(results[0]);
        this.openRepositoryMenu('local');
        this.selectSystemFolder(systemFolderOf(directory));
      } catch (error) {
        this.fail(error);
      }
      return;
    }
    await this.run(async () => {
      const added: string[] = [];
      const errors: string[] = [];
      for (const result of results) {
        try {
          added.push(await this.importSystemFolder(systemFolderOf(droppedDirectory(result))));
        } catch (error) {
          const name = result.status === 'fulfilled' ? result.value?.name : null;
          errors.push(`${name ?? 'Folder'} · ${messageOf(error)}`);
        }
      }
      if (added.length) {
        this.closeRepositoryMenu();
        this.notice.set(`Added ${added.join(', ')}`);
      }
      if (errors.length) throw new Error(errors.join(' · '));
    });
  }

  protected openLocalRepositoryPicker(): void {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (picker) {
      void this.pickLocalDirectory(picker);
      return;
    }
    this.localRepositoryInput()?.nativeElement.click();
  }

  protected selectLocalDirectory(event: Event): void {
    const element = event.target;
    if (!(element instanceof HTMLInputElement) || !element.files?.length) return;
    const files = [...element.files];
    element.value = '';
    const name = files[0]?.webkitRelativePath.split('/')[0];
    if (!name) return this.fail(new Error('请选择一个 Git 仓库文件夹'));
    this.selectSystemFolder({ name, archive: () => archiveOfUploadedDirectory(files) });
  }

  protected toggleRepositoryMenu(): void {
    if (this.repositoryMenuOpen()) {
      this.closeRepositoryMenu();
      return;
    }
    this.openRepositoryMenu('list');
  }

  protected openRepositoryMenu(kind: GithubRepositoryMenu): void {
    if (this.settingsDraft()) return;
    this.localSystemFolder.set(null);
    if (kind === 'local') {
      this.localRepositoryPath.set('');
      this.fail(null);
    }
    this.worktreeMenuOpen.set(false);
    this.branchMenuOpen.set(false);
    this.closeContextMenu();
    this.addRepositoryMenuOpen.set(false);
    this.repositoryPanel.set(kind);
    this.repositoryFilter.set('');
    this.repositoryMenuFocus.set(kind);
    this.repositoryMenuOpen.set(true);
  }

  protected closeRepositoryMenu(): void {
    this.repositoryMenuOpen.set(false);
    this.localSystemFolder.set(null);
  }

  protected toggleWorktreeMenu(): void {
    if (!this.showWorktree()) return;
    if (this.worktreeMenuOpen()) {
      this.closeWorktreeMenu();
      return;
    }
    this.closeRepositoryMenu();
    this.branchMenuOpen.set(false);
    this.closeContextMenu();
    this.worktreeFilter.set('');
    this.worktreeMenuOpen.set(true);
  }

  protected closeWorktreeMenu(): void {
    this.worktreeMenuOpen.set(false);
  }

  protected toggleBranchMenu(): void {
    if (this.branchMenuOpen()) {
      this.closeBranchMenu();
      return;
    }
    this.openBranchMenu();
  }

  protected openBranchMenu(): void {
    this.closeRepositoryMenu();
    this.worktreeMenuOpen.set(false);
    this.closeContextMenu();
    this.branchMenuFocus.set(true);
    this.createBranchOpen.set(false);
    this.branchFilter.set('');
    this.branchMenuOpen.set(true);
  }

  protected closeBranchMenu(): void {
    this.branchMenuOpen.set(false);
  }

  protected toggleChangeKind(): void {
    this.changeKindOpen.update(open => !open);
  }

  protected closeChangeKind(): void {
    this.changeKindOpen.set(false);
  }

  protected setChangeKind(kind: GithubChangeKind): void {
    this.changeKind.set(kind);
    this.changeKindOpen.set(false);
  }

  protected changeKindLabel(): string {
    const labels: Record<GithubChangeKind, string> = {
      all: 'All',
      added: 'Added',
      modified: 'Modified',
      deleted: 'Deleted'
    };
    return labels[this.changeKind()];
  }

  protected openContextMenu(event: Event, menu: GithubContextMenuTarget): void {
    event.preventDefault();
    event.stopPropagation();
    const width = 230;
    const height = menu.kind === 'file' ? 180 : 125;
    const button = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null;
    const x = event instanceof MouseEvent ? event.clientX : (button?.left ?? 8);
    const y = event instanceof MouseEvent ? event.clientY : (button?.bottom ?? 8);
    this.contextMenu.set({
      ...menu,
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - height - 8))
    });
  }

  protected closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  protected openCommitMenu(event: Event, oid: string): void {
    const anchor = event.currentTarget;
    if (!(anchor instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = anchor.getBoundingClientRect();
    this.popover.openMenu(
      [
        { id: 'copy-sha', label: 'Copy SHA', run: () => this.copyValue(oid) },
        { id: 'restore-commit', label: 'Restore this commit', disabled: this.busy(), run: () => this.restore(oid) }
      ],
      {
        x: event instanceof MouseEvent ? event.clientX : rect.left + rect.width / 2,
        y: event instanceof MouseEvent ? event.clientY : rect.bottom,
        label: 'Commit actions',
        focus: true,
        onClose: reason => {
          if (RETURNS_FOCUS.has(reason) && anchor.isConnected) anchor.focus();
        }
      }
    );
  }

  protected async copyValue(value: string): Promise<void> {
    this.closeContextMenu();
    try {
      await navigator.clipboard.writeText(value);
      this.notice.set(`Copied ${value}`);
    } catch (error) {
      this.fail(error);
    }
  }

  protected async deleteBranch(branch: string): Promise<void> {
    const record = this.activeRecord();
    if (!record || branch === this.currentBranch()) return;
    this.closeContextMenu();
    await this.run(async () => {
      this.branches.set(await this.backend.deleteBranch(record.projectId, branch));
      this.notice.set(`Deleted branch ${branch}`);
    });
  }

  protected contextSelectFile(path: string): void {
    this.closeContextMenu();
    this.openFile(path);
  }

  protected async contextShowDiff(path: string): Promise<void> {
    const entry = this.statusEntryForPath(path);
    this.closeContextMenu();
    await this.showDiff(path, entry && this.isStaged(entry) ? 'staged' : 'working');
  }

  protected async contextStage(path: string): Promise<void> {
    this.closeContextMenu();
    await this.stage(path);
  }

  protected async contextUnstage(path: string): Promise<void> {
    this.closeContextMenu();
    await this.unstage(path);
  }

  protected async contextDiscard(path: string): Promise<void> {
    this.closeContextMenu();
    await this.discard(path);
  }

  protected runSyncAction(): void {
    const action = this.syncAction();
    if (action === 'pull') void this.pull();
    else if (action === 'push' || action === 'publish') void this.push(action === 'publish');
    else if (action !== 'detached') void this.fetchOrigin();
  }

  protected openSyncMenu(event: Event): void {
    const anchor = event.currentTarget;
    if (!(anchor instanceof HTMLElement) || !this.syncHasOptions() || this.busy()) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.syncMenuOpen()) {
      this.popover.close(true);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    this.popover.openMenu([{ id: 'fetch-origin', label: 'Fetch origin', run: () => void this.fetchOrigin() }], {
      x: rect.right,
      y: rect.bottom,
      right: true,
      focus: true,
      label: 'Sync options',
      onClose: reason => {
        this.syncMenuOpen.set(false);
        if (RETURNS_FOCUS.has(reason) && anchor.isConnected) anchor.focus();
      }
    });
    this.syncMenuOpen.set(true);
  }

  protected async fetchOrigin(): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    const isRemote = Boolean(record.owner && record.repo);
    await this.run(
      async () => {
        if (!isRemote) {
          await this.refresh();
          this.lastLocalRefresh.set({ projectId: record.projectId, at: Date.now() });
          this.notice.set('Refreshed local status');
          return;
        }
        const { branch, head, changed } = await this.backend.fetch(record.projectId);
        this.activeRecord.set(this.store.find(record.projectId) ?? record);
        this.notice.set(
          head === null ? `No remote branch ${branch}`
          : changed ? 'Fetched origin'
          : 'Already up to date'
        );
      },
      isRemote ? 'fetch' : 'refresh'
    );
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

  protected startToolbarResize(event: PointerEvent, target: 'repository' | 'worktree' | 'branch'): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth =
      target === 'repository' ? this.asideWidth()
      : target === 'worktree' ? this.worktreeWidth()
      : this.branchWidth();
    const move = (moveEvent: PointerEvent): void => {
      const next = startWidth + moveEvent.clientX - startX;
      if (target === 'repository') this.asideWidth.set(Math.max(ASIDE_WIDTH_MIN, Math.min(ASIDE_WIDTH_MAX, next)));
      if (target === 'worktree') this.worktreeWidth.set(Math.max(160, Math.min(340, next)));
      if (target === 'branch') this.branchWidth.set(Math.max(210, Math.min(480, next)));
    };
    const stop = (): void => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', stop);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', stop);
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

  protected async selectFile(path: string, entry: GitStatusEntry | null): Promise<void> {
    if (this.editorDirty() && this.selectedPath() !== path) {
      this.fail(new Error('请先保存当前文件再切换文件'));
      return;
    }
    if (!entry) {
      this.openFile(path);
      return;
    }
    this.selectedPath.set(path);
    await this.showDiff(path);
  }

  protected openFile(path: string): void {
    if (this.editorDirty() && this.selectedPath() !== path) {
      this.fail(new Error('请先保存当前文件再切换文件'));
      return;
    }
    this.selectedPath.set(path);
    const file = this.files().find(item => item.path === path);
    this.editorValue.set(file ? (textOf(file.bytes) ?? '') : '');
    this.diff.set(null);
  }

  protected async openStored(record: GithubRepositoryRecord, closeMenu = true): Promise<void> {
    if (!this.ensureEditorSaved()) return;
    await this.run(async () => {
      await this.loadStoredRepository(record);
      if (closeMenu) this.closeRepositoryMenu();
    });
  }

  protected async createRepository(): Promise<void> {
    if (!this.ensureEditorSaved()) return;
    const name = this.newRepoValue().trim() || 'Untitled Repository';
    await this.run(async () => {
      const root = [...HOME, 'Documents', 'GitHub', name];
      const record = await this.backend.createDirectory(root, [{ path: 'README.md', bytes: bytesOf(`# ${name}\n`) }]);
      const projectId = record.projectId;
      await this.backend.stage(projectId, ['README.md']);
      await this.backend.commit(projectId, `Create ${name}`);
      const snapshot = await this.backend.open(projectId);
      this.activeRecord.set(record);
      this.showCleanFiles.set(false);
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
        const currentStatus = await this.backend.status(existing.projectId);
        if (
          currentStatus.branch === remote.record.branch &&
          existing.owner === remote.record.owner &&
          existing.repo === remote.record.repo
        ) {
          await this.backend.pull(existing.projectId, remote);
          if (branchBaseOf(existing, currentStatus.branch)?.head !== remote.record.remoteHead)
            this.notice.set(`Pulled ${existing.name}`);
        }
        await this.loadStoredRepository(this.store.find(existing.projectId) ?? existing);
        return;
      }
      const snapshot = await this.backend.create(remote.record.projectId, remote.files);
      await this.backend.stage(
        remote.record.projectId,
        remote.files.map(file => file.path)
      );
      const localHead = await this.backend.commit(
        remote.record.projectId,
        `Import ${remote.record.name}@${remote.record.branch}`
      );
      if (remote.record.branch !== 'main') {
        await this.backend.createBranch(remote.record.projectId, remote.record.branch);
        await this.backend.checkout(remote.record.projectId, remote.record.branch);
      }
      await this.backend.setClonedOrigin(remote.record);
      const record = { ...remote.record, localHead, lastFetchedAt: remote.record.updatedAt };
      await this.store.put(record);
      this.activeRecord.set(record);
      this.showCleanFiles.set(false);
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
    element.value = '';
    await this.run(async () => {
      const name = file.name.replace(/\.(zip|tar)$/i, '') || 'Imported Repository';
      const bytes = new Uint8Array(await file.arrayBuffer()) as Uint8Array<ArrayBuffer>;
      await this.importArchive(name, bytes, 'Imported');
      this.closeRepositoryMenu();
    });
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

  protected async toggleStage(entry: GitStatusEntry): Promise<void> {
    await (this.isStaged(entry) ? this.unstage(entry.path) : this.stage(entry.path));
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
      this.showCleanFiles.set(false);
      await this.refresh();
      this.notice.set(`Discarded ${path}`);
    });
  }

  protected async discardAllChanges(): Promise<void> {
    const record = this.activeRecord();
    const entries = this.changedEntries();
    if (!record || (!entries.length && !this.editorDirty())) return;
    await this.run(async () => {
      const stagedPaths = entries.filter(entry => this.isStaged(entry)).map(entry => entry.path);
      if (stagedPaths.length) await this.backend.unstage(record.projectId, stagedPaths);

      const status = await this.backend.status(record.projectId);
      const workingPaths = status.entries
        .filter(entry => entry.worktree !== ' ' && entry.worktree !== '!')
        .map(entry => entry.path);
      for (const path of workingPaths) await this.backend.discardWorking(record.projectId, path);

      this.applySnapshot((await this.backend.snapshot(record.projectId)).files);
      this.diff.set(null);
      this.showCleanFiles.set(false);
      await this.refresh();
      this.notice.set('Discarded all changes');
    });
  }

  protected async showDiff(path: string, kind?: 'working' | 'staged'): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    while (this.busy()) await new Promise<void>(resolve => setTimeout(resolve, 0));
    const entry = this.statusEntryForPath(path);
    const resolvedKind = kind ?? (entry && this.isStaged(entry) ? 'staged' : 'working');
    await this.run(async () => {
      this.selectedPath.set(path);
      this.diff.set(await this.backend.readDiff(record.projectId, path, resolvedKind));
    });
  }

  protected async commit(): Promise<void> {
    const record = this.activeRecord();
    const summary = this.commitValue().trim() || this.commitMessageInput()?.nativeElement.value.trim() || '';
    const description = this.commitDescription().trim();
    const message = summary ? `${summary}${description ? `\n\n${description}` : ''}` : '';
    if (!record || !message) return;
    await this.run(async () => {
      const oid = await this.backend.commit(record.projectId, message);
      this.commitValue.set('');
      this.commitDescription.set('');
      const input = this.commitMessageInput()?.nativeElement;
      if (input) input.value = '';
      this.showCleanFiles.set(false);
      await this.refresh();
      this.notice.set(`Committed ${oid.slice(0, 8)}`);
    });
  }

  protected commitReady(): boolean {
    return Boolean(this.commitValue().trim() || this.commitMessageInput()?.nativeElement.value.trim());
  }

  protected async createBranch(): Promise<void> {
    const record = this.activeRecord();
    const branch = this.newBranchValue().trim();
    if (!record || !branch) return;
    await this.run(async () => {
      this.branches.set(await this.backend.createBranch(record.projectId, branch));
      this.newBranchValue.set('');
      this.branchFilter.set('');
      this.branchMenuOpen.set(false);
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
    this.branchMenuOpen.set(false);
    if (this.editorDirty()) {
      this.fail(new Error('请先保存当前文件再切换分支'));
      return;
    }
    this.pendingBranch.set(branch);
    await this.run(async () => {
      await this.backend.checkout(record.projectId, branch, force);
      const snapshot = await this.backend.snapshot(record.projectId);
      const next = { ...(this.store.find(record.projectId) ?? record), updatedAt: Date.now() };
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
      if (!this.ensureEditorSaved()) return;
      const snapshot = await this.backend.pull(record.projectId);
      this.activeRecord.set(this.store.find(record.projectId)!);
      this.applySnapshot(snapshot.files);
      await this.refresh();
      this.notice.set(`Pulled ${record.name}`);
    }, 'pull');
  }

  protected async push(publish = false): Promise<void> {
    const record = this.activeRecord();
    if (!record?.owner || !record.repo) return;
    await this.run(
      async () => {
        if (this.status()?.entries.length || this.editorDirty())
          throw new Error('请先保存并提交本地改动，再推送到 GitHub');
        const next = await this.backend.push(record.projectId, this.commitValue() || 'Update from Aiao Desktop');
        this.activeRecord.set(next);
        this.notice.set(publish ? `Published branch ${next.branch}` : `Pushed ${next.remoteHead.slice(0, 8)}`);
      },
      publish ? 'publish' : 'push'
    );
  }

  protected loginWithPat(value = this.patValue()): void {
    const token = value.trim();
    if (!token || this.authBusy()) return;
    this.patValue.set('');
    void this.changeAccount(async () => {
      await this.auth.loginWithPat(token);
    }, 'Signed in to GitHub');
  }

  protected loginWithOAuth(): void {
    if (this.authBusy()) return;
    const attempt = new AbortController();
    this.oauthAttempt.set(attempt);
    const timeout = AbortSignal.timeout(120_000);
    const signal = AbortSignal.any([attempt.signal, timeout]);
    void this.changeAccount(async () => {
      // 先同步打开占位窗口，避免异步获取 OAuth 配置后失去用户手势。
      const popup = window.open('about:blank', '_blank', 'popup,width=600,height=750');
      try {
        if (!popup) throw new Error('浏览器未能打开 GitHub 授权页，请允许弹窗后重试');
        popup.opener = null;
        const pending = await this.auth.beginOAuth(signal);
        signal.throwIfAborted();
        if (popup.closed) throw new Error('GitHub 授权窗口已关闭');
        const code = await waitForOAuthCode(popup, pending, signal);
        await this.auth.completeOAuth(code, pending.verifier, pending.state, signal);
      } catch (error) {
        if (timeout.aborted && !attempt.signal.aborted) throw new Error('GitHub 授权超时，请重试', { cause: error });
        if (!attempt.signal.aborted) throw error;
        throw attempt.signal.reason;
      } finally {
        if (popup && !popup.closed) popup.close();
        this.oauthAttempt.set(null);
      }
    }, 'Signed in to GitHub');
  }

  protected cancelOAuth(): void {
    this.oauthAttempt()?.abort(new Error('已取消 GitHub 授权'));
  }

  protected logout(): void {
    if (!this.authBusy()) void this.changeAccount(() => this.auth.logout(), 'Signed out of GitHub');
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

  protected changeKindFor(entry: GitStatusEntry): Exclude<GithubChangeKind, 'all'> {
    if (entry.index === 'D' || entry.worktree === 'D') return 'deleted';
    if (entry.index === '?' && entry.worktree === '?') return 'added';
    return 'modified';
  }

  protected commitChangeDescription(change: GitCommitFileChange): string {
    return (
      change.status === 'added' ? 'Added'
      : change.status === 'deleted' ? 'Deleted'
      : 'Modified'
    );
  }

  protected shortOid(oid: string): string {
    return oid.slice(0, 7);
  }

  protected commitTime(timestamp: number | null): string {
    if (timestamp === null) return '';
    if (this.savedAppearance().absoluteDates) return this.absoluteCommitTime(timestamp);
    const minutes = Math.trunc((timestamp - Date.now()) / 60_000);
    if (minutes === 0) return 'just now';
    if (Math.abs(minutes) < 60) return relativeTime.format(minutes, 'minute');
    if (Math.abs(minutes) < 1440) return relativeTime.format(Math.trunc(minutes / 60), 'hour');
    if (Math.abs(minutes) < 43200) return relativeTime.format(Math.trunc(minutes / 1440), 'day');
    return this.absoluteCommitTime(timestamp);
  }

  protected numberText(value: number): string {
    return formatGithubNumber(value, this.savedAppearance().numberFormat);
  }

  protected setHistoryDiffLayout(split: boolean): void {
    this.sideBySideHistory.set(split);
    localStorage.setItem('aiao-desktop-diff-side-by-side', String(split));
    this.closeHistoryDiffSettings();
  }

  protected toggleHistoryDetails(): void {
    this.historyDetailsExpanded.update(expanded => !expanded);
  }

  protected toggleHistoryDiffSettings(): void {
    this.historyDiffSettingsOpen.update(open => !open);
  }

  protected closeHistoryDiffSettings(): void {
    this.historyDiffSettingsOpen.set(false);
  }

  protected isStaged(entry: GitStatusEntry): boolean {
    return entry.index !== ' ' && entry.index !== '?';
  }

  protected closeDiff(): void {
    this.diff.set(null);
  }

  protected setTab(tab: GithubTab): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    this.diff.set(null);
    if (tab === 'history') this.synchronizeHistorySelection();
  }

  protected chooseCompareBranch(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    this.resetComparison(event.target.value || null);
    this.updateComparison();
    this.synchronizeHistorySelection();
  }

  protected showCompareDirection(direction: 'ahead' | 'behind'): void {
    this.compareDirection.set(direction);
    this.synchronizeHistorySelection();
  }

  protected stopComparing(): void {
    this.resetComparison(null);
    this.synchronizeHistorySelection();
  }

  protected focusChangesFilter(): void {
    this.setTab('changes');
    this.changesFilterFocus.set(true);
  }

  protected async selectCommit(oid: string | null): Promise<void> {
    const request = ++this.historyLoadRequest;
    this.selectedCommitOid.set(oid);
    this.historyChanges.set([]);
    this.historyDetailsExpanded.set(false);
    this.historyDiffSettingsOpen.set(false);
    this.selectedHistoryPath.set(null);
    this.historyDiff.set(null);
    const record = this.activeRecord();
    if (!record || !oid) return;
    const branch = this.compareDirection() === 'behind' ? this.compareBranch() : null;
    try {
      const changes = await this.backend.commitChanges(record.projectId, oid, branch ?? undefined);
      if (
        this.destroyRef.destroyed ||
        request !== this.historyLoadRequest ||
        record.projectId !== this.activeRecord()?.projectId
      )
        return;
      this.historyChanges.set(changes);
      if (changes[0]) this.selectHistoryFile(changes[0]);
    } catch (error) {
      if (!this.destroyRef.destroyed && request === this.historyLoadRequest) this.fail(error);
    }
  }

  protected selectHistoryFile(change: GitCommitFileChange): void {
    this.selectedHistoryPath.set(change.path);
    this.historyDiffSettingsOpen.set(false);
    this.historyDiff.set(change);
  }

  protected cancelSettings(): void {
    this.cancelOAuth();
    this.settingsDraft.set(null);
  }

  protected async saveSettings(): Promise<void> {
    const draft = this.settingsDraft();
    if (!draft || this.settingsSaving()) return;
    this.settingsSaving.set(true);
    this.settingsError.set(null);
    try {
      if (draft !== this.savedAppearance()) await this.preferences.set(APPEARANCE_KEY, draft);
      if (!draft.alwaysShowWorktree) this.closeWorktreeMenu();
      this.cancelSettings();
    } catch (error) {
      this.settingsError.set(messageOf(error));
    } finally {
      this.settingsSaving.set(false);
    }
  }

  private async changeAccount(action: () => Promise<void>, notice: string): Promise<void> {
    this.authBusy.set(true);
    this.authError.set(null);
    this.fail(null);
    try {
      await action();
      localStorage.setItem('aiao-desktop-github-session-updated', String(Date.now()));
      this.notice.set(notice);
    } catch (error) {
      this.authError.set(messageOf(error));
    } finally {
      this.authBusy.set(false);
    }
  }

  private absoluteCommitTime(timestamp: number): string {
    const date = new Date(timestamp);
    const { dateFormat, timeFormat } = this.savedAppearance();
    return `${formatGithubDate(date, dateFormat)}, ${formatGithubTime(date, timeFormat)}`;
  }

  private resetComparison(branch: string | null): void {
    this.comparisonRequest++;
    this.comparisonKey = null;
    this.compareBranch.set(branch);
    this.comparison.set(null);
    this.compareDirection.set('ahead');
  }

  private updateComparison(): void {
    const branch = this.compareBranch();
    if (!branch) return;
    const target = this.compareBranches().find(item => item.name === branch);
    const record = this.activeRecord();
    const head = this.status()?.head;
    if (!record || !head || !target?.oid) {
      this.resetComparison(null);
      return;
    }
    const key = JSON.stringify([record.projectId, head, target.name, target.oid]);
    if (this.comparisonKey === key) return;
    this.comparisonKey = key;
    const request = ++this.comparisonRequest;
    void this.backend
      .compareHistory(record.projectId, branch)
      .then(result => {
        if (
          this.destroyRef.destroyed ||
          request !== this.comparisonRequest ||
          record.projectId !== this.activeRecord()?.projectId
        )
          return;
        if (this.comparison() === null && result.ahead === 0 && result.behind > 0) this.compareDirection.set('behind');
        this.comparison.set(result);
        this.synchronizeHistorySelection();
      })
      .catch(error => {
        if (this.destroyRef.destroyed || request !== this.comparisonRequest) return;
        this.resetComparison(null);
        this.synchronizeHistorySelection();
        this.fail(error);
      });
  }

  private synchronizeHistorySelection(): void {
    if (this.tab() !== 'history') return;
    const commit = this.selectedCommit();
    if (commit && commit.oid === this.selectedCommitOid()) return;
    void this.selectCommit(commit?.oid ?? null);
  }

  private openSettings(): void {
    if (this.repositoryModalOpen()) return;
    this.closeRepositoryMenu();
    this.closeWorktreeMenu();
    this.branchMenuOpen.set(false);
    this.closeContextMenu();
    this.closeHistoryDiffSettings();
    this.authError.set(null);
    this.settingsError.set(null);
    this.settingsDraft.set(this.savedAppearance());
  }

  private async openRepositorySettings(): Promise<void> {
    const record = this.activeRecord();
    if (!record || this.busy() || this.repositoryModalOpen()) return;
    this.closeRepositoryMenu();
    this.closeWorktreeMenu();
    this.branchMenuOpen.set(false);
    this.closeContextMenu();
    await this.run(async () => {
      const origin = await this.backend.origin(record.projectId);
      if (this.destroyRef.destroyed) return;
      this.remoteDraft.set(origin ?? '');
      this.repositorySettings.set({ projectId: record.projectId, origin });
    });
  }

  private canDropRepository(): boolean {
    const hasDialog = this.repositoryModalOpen() || (this.repositoryMenuOpen() && this.repositoryPanel() !== 'list');
    return !hasDialog && !this.busy() && !this.destroyRef.destroyed;
  }

  private focusDropTarget(): void {
    if (this.wm.focused() !== this.win) this.wm.focus(this.win.id);
  }

  private selectSystemFolder(folder: SystemRepositoryFolder): void {
    this.localSystemFolder.set(folder);
    this.fail(null);
  }

  private async pickLocalDirectory(picker: DirectoryPicker): Promise<void> {
    try {
      const directory = await picker.call(window);
      if (this.localRepositoryOpen() && !this.destroyRef.destroyed) this.selectSystemFolder(systemFolderOf(directory));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.fail(error);
    }
  }

  private async importSystemFolder(folder: SystemRepositoryFolder): Promise<string> {
    const { name, archive } = await folder.archive();
    return this.importArchive(name, archive, 'Added');
  }

  private async loadStoredRepository(record: GithubRepositoryRecord): Promise<void> {
    const snapshot = await this.backend.open(record.projectId);
    this.activeRecord.set(record);
    this.showCleanFiles.set(false);
    this.repoValue.set(record.owner && record.repo ? `${record.owner}/${record.repo}` : '');
    this.branchValue.set(record.owner ? record.branch : '');
    this.applySnapshot(snapshot.files);
    await this.refresh();
  }

  private async importArchive(
    name: string,
    bytes: Uint8Array<ArrayBuffer>,
    noticeVerb: 'Added' | 'Imported'
  ): Promise<string> {
    const { record, snapshot } = await this.backend.importDirectory(name, bytes);
    this.activeRecord.set(record);
    this.showCleanFiles.set(false);
    this.applySnapshot(snapshot.files);
    await this.refresh();
    const path = toVmPath(record.rootPath);
    this.notice.set(`${noticeVerb} ${name} · ${path}`);
    return path;
  }

  private menuSections() {
    return this.menus.github({
      activeTab: () => this.tab(),
      hasRepository: () => this.activeRecord() !== null,
      hasRemote: () => Boolean(this.activeRecord()?.owner && this.activeRecord()?.repo),
      hasChanges: () => this.hasChanges(),
      isBusy: () => this.busy() || this.repositorySettings() !== null || !!this.settingsDraft(),
      openSettings: () => this.openSettings(),
      openRepositoryMenu: kind => this.openRepositoryMenu(kind),
      openLocalRepository: () => this.openLocalRepository(),
      openRepositorySettings: () => void this.openRepositorySettings(),
      openInEditor: () => this.openRepositoryInEditor(),
      openInTerminal: () => void this.openRepositoryInTerminal(),
      openBranchMenu: () => this.openBranchMenu(),
      focusChangesFilter: () => this.focusChangesFilter(),
      setTab: tab => this.setTab(tab),
      fetch: () => void this.fetchOrigin(),
      pull: () => void this.pull(),
      push: () => void this.push(),
      discardAllChanges: () => void this.discardAllChanges(),
      openExternal: target => this.openExternal(target)
    });
  }

  private openExternal(target: GithubExternalTarget): void {
    const record = this.activeRecord();
    const base = record?.owner && record.repo ? `https://github.com/${record.owner}/${record.repo}` : null;
    const branch = record?.branch
      .split('/')
      .map(part => encodeURIComponent(part))
      .join('/');
    const urls: Record<GithubExternalTarget, string | null> = {
      repository: base,
      issue: base ? `${base}/issues/new` : null,
      compare: base && branch ? `${base}/compare/${branch}` : null,
      branch: base && branch ? `${base}/tree/${branch}` : null,
      'pull-request': base && branch ? `${base}/compare/${branch}?expand=1` : null,
      'report-issue': 'https://github.com/desktop/desktop/issues/new/choose',
      support: 'https://support.github.com/contact',
      guides: 'https://docs.github.com/en/desktop',
      shortcuts:
        'https://docs.github.com/en/desktop/installing-and-configuring-github-desktop/overview/keyboard-shortcuts'
    };
    const url = urls[target];
    if (!url) return;
    if (!window.open(url, '_blank', 'noopener,noreferrer')) this.notice.set('请允许打开外部页面后重试');
  }

  private async restoreLastRepository(): Promise<void> {
    await this.store.ready();
    const record = this.win.options.projectId ? this.store.find(this.win.options.projectId) : this.records()[0];
    if (!record) return;
    const pending = Promise.resolve().then(() => this.openStored(record, false));
    this.restorePromise = pending;
    try {
      await pending;
    } finally {
      if (this.restorePromise === pending) this.restorePromise = null;
    }
  }

  private reloadExternal(): void {
    if (!this.activeRecord()) return;
    this.externalRefreshPending = true;
    void this.flushExternalRefresh();
  }

  private async flushExternalRefresh(): Promise<void> {
    if (this.externalRefreshing || this.busy() || this.destroyRef.destroyed) return;
    this.externalRefreshing = true;
    try {
      while (this.externalRefreshPending && !this.busy() && !this.destroyRef.destroyed) {
        this.externalRefreshPending = false;
        await this.refresh(true);
      }
    } catch (error) {
      if (!this.destroyRef.destroyed) this.fail(error);
    } finally {
      this.externalRefreshing = false;
      if (this.externalRefreshPending) void this.flushExternalRefresh();
    }
  }

  private async refresh(external = false): Promise<void> {
    const record = this.activeRecord();
    if (!record) return;
    const operation = this.operation;
    const { snapshot, status, branches, history } = await this.backend.inspect(record.projectId);
    if (this.destroyRef.destroyed || record.projectId !== this.activeRecord()?.projectId) return;
    if (external && (this.busy() || operation !== this.operation)) {
      this.externalRefreshPending = true;
      return;
    }
    if (external) this.activeRecord.set(this.store.find(record.projectId) ?? record);
    if (!this.editorDirty()) {
      if (snapshot.revision !== this.currentRevision) {
        this.applySnapshot(snapshot.files);
        this.diff.set(null);
      }
      this.currentRevision = snapshot.revision;
    }
    this.status.set(status);
    this.branches.set(branches);
    this.history.set(history);
    if (this.historyProjectId !== record.projectId) {
      this.historyProjectId = record.projectId;
      this.resetComparison(null);
      void this.selectCommit(null);
    }
    this.updateComparison();
    this.synchronizeHistorySelection();
    this.win.restoreOptions.set({ projectId: record.projectId });
    this.win.title.set(`GitHub Desktop · ${record.name}`);
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

  private async run(task: () => Promise<void>, operation: GithubSyncOperation | null = null): Promise<void> {
    if (this.busy()) {
      const restore = this.restorePromise;
      if (restore) {
        await restore;
        return this.run(task, operation);
      }
      return;
    }
    this.operation++;
    this.busy.set(true);
    this.syncing.set(operation);
    this.fail(null);
    try {
      await task();
    } catch (error) {
      this.fail(error);
      if (errorCodeOf(error) === 'storage_failed') this.backend.restart();
    } finally {
      this.zone.run(() => {
        this.syncing.set(null);
        this.busy.set(false);
        void this.flushExternalRefresh();
        if (!this.destroyRef.destroyed) {
          this.changeDetectorRef.detectChanges();
          this.applicationRef.tick();
        }
      });
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
}
