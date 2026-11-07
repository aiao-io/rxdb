import 'vscode/localExtensionHost';
import { initialize, getService, IEditorGroupsService, IEditorService } from '@codingame/monaco-vscode-api';
import { registerExtension, ExtensionHostKind, type IExtensionManifest } from '@codingame/monaco-vscode-api/extensions';
import { createModelReference } from '@codingame/monaco-vscode-api/monaco';
import { isCancellationError } from '@codingame/monaco-vscode-api/vscode/vs/base/common/errors';
import { URI } from '@codingame/monaco-vscode-api/vscode/vs/base/common/uri';
import { InMemoryFileSystemProvider } from '@codingame/monaco-vscode-api/vscode/vs/platform/files/common/inMemoryFilesystemProvider';
import type { IFileWriteOptions } from '@codingame/monaco-vscode-api/vscode/vs/platform/files/common/files';
import getConfigurationOverride from '@codingame/monaco-vscode-configuration-service-override';
import { registerFileSystemOverlay } from '@codingame/monaco-vscode-files-service-override';
import getLanguagesOverride from '@codingame/monaco-vscode-languages-service-override';
import getModelOverride from '@codingame/monaco-vscode-model-service-override';
import getNotificationOverride from '@codingame/monaco-vscode-notifications-service-override';
import getStorageOverride from '@codingame/monaco-vscode-storage-service-override';
import getThemeOverride from '@codingame/monaco-vscode-theme-service-override';
import getViewsOverride, { attachPart, Parts } from '@codingame/monaco-vscode-views-service-override';
import { editor, languages } from '@codingame/monaco-vscode-editor-api';
import { WebviewInput } from '@codingame/monaco-vscode-api/vscode/vs/workbench/contrib/webviewPanel/browser/webviewEditorInput';
import type { WorkbenchEditorViewport } from '../src/workbench/editor.js';
import type * as VSCode from 'vscode';
import { EXTENSION_CHANNEL, type ExtensionSnapshot, type ExtensionRequest, type ExtensionEvent, type ExtensionReply } from '../src/workbench/extensions/extension-protocol.js';

interface ExtensionAssets {
  readonly id: string;
  readonly version: string;
  readonly manifest: IExtensionManifest;
  readonly translations: Readonly<Record<string, string>>;
  readonly files: readonly { readonly path: string; readonly bytes: number; readonly sha256: string }[];
}

(globalThis as typeof globalThis & { global: typeof globalThis }).global = globalThis;
window.addEventListener('unhandledrejection', event => { if (isCancellationError(event.reason)) event.preventDefault(); });

const status = document.getElementById('status')!;
const source = document.getElementById('source')!;
const editors = document.getElementById('editors')!;
let port: MessagePort;
let api: typeof VSCode;
let snapshot: ExtensionSnapshot;
let mirror: editor.IStandaloneCodeEditor;
let requestId = 0;
let syncingFiles = false;
let syncingViewport = false;
let sourceCursor: { path: string | null; line: number; column: number } | undefined;
const writeRequests = new Map<number, { resolve(): void; reject(error: Error): void }>();
const references = new Map<string, Awaited<ReturnType<typeof createModelReference>>>();
const encoder = new TextEncoder();
const workspaceRoot = URI.file('/workspace');
const send = (message: ExtensionEvent | ExtensionReply) => port.postMessage(message);
const uriFor = (path: string) => URI.joinPath(workspaceRoot, path);
const pathFor = (uri: { readonly scheme: string; readonly path: string }) => uri.scheme === 'file' && uri.path.startsWith('/workspace/') ? uri.path.slice('/workspace/'.length) : undefined;

class WorkspaceFileSystem extends InMemoryFileSystemProvider {
  override async writeFile(uri: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
    const path = pathFor(uri);
    if (!syncingFiles && path !== undefined) {
      const id = ++requestId;
      await new Promise<void>((resolve, reject) => {
        writeRequests.set(id, { resolve, reject });
        send({ type: 'write', id, path, content, baseline: { draft: snapshot.files[path], saved: snapshot.savedFiles[path] } });
      });
    }
    await super.writeFile(uri, content, options);
  }
}
const fs = new WorkspaceFileSystem();

const directories = new Set(['/']);
async function ensureDirectory(uri: URI): Promise<void> {
  if (directories.has(uri.path)) return;
  await ensureDirectory(URI.joinPath(uri, '..'));
  await fs.mkdir(uri);
  directories.add(uri.path);
}

function sameContent(left: string | Uint8Array | undefined, right: string | Uint8Array | undefined): boolean {
  if (left === right) return true;
  return left instanceof Uint8Array && right instanceof Uint8Array && left.length === right.length && left.every((byte, index) => byte === right[index]);
}

async function syncFile(path: string, next: ExtensionSnapshot, previous: ExtensionSnapshot | undefined): Promise<void> {
  const draft = next.files[path];
  const saved = next.savedFiles[path];
  const diskContent = saved ?? (typeof draft === 'string' ? '' : draft);
  const previousDisk = previous?.savedFiles[path] ?? (typeof previous?.files[path] === 'string' ? '' : previous?.files[path]);
  if (!previous || !Object.hasOwn(previous.files, path) || !sameContent(previousDisk, diskContent)) {
    await ensureDirectory(URI.joinPath(uriFor(path), '..'));
    await fs.writeFile(uriFor(path), typeof diskContent === 'string' ? encoder.encode(diskContent) : diskContent, { create: true, overwrite: true, unlock: false, atomic: false });
  }
  const reference = references.get(path);
  const model = reference?.object.textEditorModel;
  if (model && typeof draft === 'string' && model.getValue() !== draft)
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: draft }], () => null);
  if (reference && typeof saved === 'string' && saved === draft && reference.object.isDirty()) await reference.object.save();
}

async function applySnapshot(next: ExtensionSnapshot): Promise<void> {
  if (snapshot && snapshot.projectId !== next.projectId) throw new Error('扩展宿主不能复用到其他项目');
  const previous = snapshot;
  snapshot = next;
  syncingFiles = true;
  try {
    for (const path of Object.keys(previous?.files ?? {})) {
      if (Object.hasOwn(next.files, path)) continue;
      references.get(path)?.dispose();
      references.delete(path);
      await fs.delete(uriFor(path), { recursive: false, useTrash: false, atomic: false });
    }
    for (const path of Object.keys(next.files)) await syncFile(path, next, previous);
    if (mirror && next.activePath && typeof next.files[next.activePath] === 'string') await selectDocument(next.activePath);
  } finally { syncingFiles = false; }
}

async function selectDocument(path: string): Promise<void> {
  let reference = references.get(path);
  if (!reference) {
    reference = await createModelReference(uriFor(path));
    references.set(path, reference);
  }
  const model = reference.object.textEditorModel!;
  editor.setModelLanguage(model, /\.(md|markdown|mdown|mkd|mdx)$/i.test(path) ? 'markdown' : 'plaintext');
  const draft = snapshot.files[path];
  if (typeof draft === 'string' && model.getValue() !== draft) model.pushEditOperations([], [{ range: model.getFullModelRange(), text: draft }], () => null);
  if (mirror.getModel() !== model) {
    mirror.setModel(model);
    mirror.focus();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}

function applyViewport(viewport: WorkbenchEditorViewport): void {
  const lineCount = mirror.getModel()?.getLineCount() ?? 1;
  const first = Math.max(1, Math.min(viewport.firstLine, lineCount));
  const last = Math.max(first, Math.min(viewport.lastLine, lineCount));
  const height = (last - first + 1) * mirror.getOption(editor.EditorOption.lineHeight);
  syncingViewport = true;
  try {
    source.style.height = `${height}px`;
    mirror.layout({ width: 800, height });
    mirror.setScrollTop(mirror.getTopForLineNumber(first));
  } finally { syncingViewport = false; }
}

async function activate(initial: ExtensionSnapshot): Promise<void> {
  const assetsURL = new URL('../extensions/shd101wyy.markdown-preview-enhanced/', location.href);
  const response = await fetch(new URL('extension-assets.json', assetsURL));
  if (!response.ok) throw new Error(`扩展资源清单加载失败：HTTP ${response.status}`);
  const assets = await response.json() as ExtensionAssets;
  if (assets.id !== 'shd101wyy.markdown-preview-enhanced' || assets.version !== '0.8.40' || !assets.manifest.browser)
    throw new Error('Markdown 扩展清单与预装版本不符');
  registerFileSystemOverlay(10, fs);
  await ensureDirectory(workspaceRoot);
  await applySnapshot(initial);
  const bridge = registerExtension({ name: 'workspace-bridge', publisher: 'aiao', version: '1.0.0', engines: { vscode: '*' }, contributes: { languages: [{ id: 'markdown', extensions: ['.md', '.markdown', '.mdown', '.mkd', '.mdx'] }] } }, ExtensionHostKind.LocalProcess);
  const extension = registerExtension(assets.manifest, ExtensionHostKind.LocalProcess, { path: '/extension' });
  for (const file of assets.files)
    extension.registerFileUrl(file.path, new URL(file.path, assetsURL).href, { size: file.bytes });
  const workerURL = new URL('editor-worker.js', location.href);
  globalThis.MonacoEnvironment = { getWorker: () => new Worker(workerURL, { type: 'module' }) };
  await initialize({ ...getConfigurationOverride(), ...getLanguagesOverride(), ...getModelOverride(), ...getNotificationOverride(), ...getStorageOverride(), ...getThemeOverride(), ...getViewsOverride(async reference => {
    const path = pathFor(reference.object.textEditorModel!.uri);
    if (!path) { reference.dispose(); throw new Error('无法打开工作区外的文件'); }
    await selectDocument(path);
    reference.dispose();
    send({ type: 'reveal', path, line: 1 });
    return mirror;
  }) }, document.body, {
    workspaceProvider: { workspace: { folderUri: workspaceRoot }, trusted: true, open: async () => false },
    configurationDefaults: { 'workbench.colorTheme': 'Default Dark Modern', 'workbench.editor.showTabs': 'none', 'workbench.startupEditor': 'none', 'security.workspace.trust.enabled': false, 'markdown-preview-enhanced.previewMode': 'Single Preview', 'markdown-preview-enhanced.enableScriptExecution': false },
    developmentOptions: { logLevel: 3 }
  }, { userHome: URI.file('/user') });
  attachPart(Parts.EDITOR_PART, editors);
  languages.register({ id: 'markdown' });
  mirror = editor.create(source, { automaticLayout: true, minimap: { enabled: false }, model: null });
  mirror.onDidScrollChange(event => {
    const path = mirror.getModel() ? pathFor(mirror.getModel()!.uri) : undefined;
    const first = mirror.getVisibleRanges()[0]?.startLineNumber;
    if (!syncingViewport && event.scrollTopChanged && path && first) send({ type: 'scroll', path, line: first });
  });
  const editorService = await getService(IEditorService);
  editorService.onDidCloseEditor(event => {
    if (event.editor instanceof WebviewInput && !editorService.editors.some(input => input instanceof WebviewInput)) send({ type: 'closed' });
  });
  api = await bridge.getApi();
  await bridge.setAsDefaultApi();
  api.workspace.onDidChangeTextDocument(event => {
    const path = pathFor(event.document.uri);
    if (!path || event.document.getText() === snapshot.files[path]) return;
    send({ type: 'edit', path, content: event.document.getText(), baseContent: typeof snapshot.files[path] === 'string' ? snapshot.files[path] : undefined });
  });
  api.window.onDidChangeTextEditorSelection(event => {
    const path = pathFor(event.textEditor.document.uri);
    const position = event.selections[0].active;
    const fromSource = path === sourceCursor?.path && position.line + 1 === sourceCursor?.line && position.character + 1 === sourceCursor?.column;
    if (path && !fromSource && event.kind === api.TextEditorSelectionChangeKind.Command) send({ type: 'reveal', path, line: position.line + 1 });
  });
  if (initial.activePath && typeof initial.files[initial.activePath] === 'string') await selectDocument(initial.activePath);
  mirror.focus();
  await extension.whenReady();
  const actual = api.extensions.getExtension(assets.id);
  if (!actual) throw new Error('正式 Markdown 扩展未注册到宿主');
  await actual.activate();
  const registered = new Set(await api.commands.getCommands(true));
  const commands = (assets.manifest.contributes?.commands ?? []).filter(command => registered.has(command.command)).map(command => ({ id: command.command, label: (typeof command.title === 'string' ? command.title : command.title.value).replace(/^%(.+)%$/, (_token, key: string) => assets.translations[key]) }));
  if (!registered.has('markdown-preview-enhanced.openPreviewToTheSide')) throw new Error('Markdown 扩展激活失败：预览命令没有注册');
  status.textContent = '';
  send({ type: 'ready', commands });
}

const previewCommands = new Set([
  'markdown-preview-enhanced.openCurrentSourceInEditor',
  'markdown-preview-enhanced.openCurrentSourceInEditorAndClosePreview',
  'markdown-preview-enhanced.togglePreviewLock',
  'markdown-preview-enhanced.toggleScrollSync',
  'markdown-preview-enhanced.toggleLiveUpdate',
  'markdown-preview-enhanced.toggleBreakOnSingleNewLine'
]);

async function focusPreview(): Promise<void> {
  const service = await getService(IEditorService);
  const pane = service.visibleEditorPanes.find(pane => pane.input instanceof WebviewInput);
  if (!pane) throw new Error('请先打开 Markdown 预览');
  pane.focus();
  const deadline = performance.now() + 2000;
  while (!(api.window.tabGroups.activeTabGroup.activeTab?.input instanceof api.TabInputWebview)) {
    if (performance.now() >= deadline) throw new Error('Markdown 预览没有获得活动标签焦点');
    await new Promise<void>(resolve => setTimeout(resolve, 25));
  }
}

async function handle(request: ExtensionRequest): Promise<void> {
  if (request.type === 'sync') await applySnapshot(request.snapshot);
  if (request.type === 'cursor') {
    sourceCursor = { path: snapshot.activePath, line: request.line, column: request.column };
    mirror.setPosition({ lineNumber: request.line, column: request.column });
  }
  if (request.type === 'viewport') applyViewport(request.viewport);
  if (request.type === 'execute') {
    if (!request.command.startsWith('markdown-preview-enhanced.')) throw new Error('不允许执行非 Markdown 扩展命令');
    if (snapshot.activePath && typeof snapshot.files[snapshot.activePath] === 'string') await selectDocument(snapshot.activePath);
    const groups = await getService(IEditorGroupsService);
    if (previewCommands.has(request.command)) await focusPreview();
    else {
      mirror.focus();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      (groups as typeof groups & { activeGroupOverride: undefined }).activeGroupOverride = undefined;
    }
    await api.commands.executeCommand(request.command);
    for (const group of groups.mainPart.groups) if (group.isEmpty && groups.mainPart.groups.length > 1) groups.removeGroup(group);
  }
}

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.channel !== EXTENSION_CHANNEL || port || event.ports.length !== 1) return;
  port = event.ports[0];
  let chain = activate(event.data.snapshot as ExtensionSnapshot);
  void chain.catch(error => { status.textContent = `Markdown 扩展加载失败：${String(error)}`; send({ type: 'error', message: String(error) }); });
  port.onmessage = message => {
    const request = message.data as ExtensionRequest | { type: 'written'; id: number; error?: string };
    if (request.type === 'written') {
      const pending = writeRequests.get(request.id);
      writeRequests.delete(request.id);
      if (request.error) pending?.reject(new Error(request.error)); else pending?.resolve();
      return;
    }
    chain = chain.then(() => handle(request)).then(() => send({ type: 'reply', id: request.id }), error => send({ type: 'reply', id: request.id, error: String(error) }));
  };
});
