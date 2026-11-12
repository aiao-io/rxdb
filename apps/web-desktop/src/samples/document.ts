import { documentRoute, parseEditorRoute } from '../apps/editor-navigation.js';
import { EditorDocument } from '../apps/editor.js';
import { AppNavigation } from '../apps/navigation.js';
import { download, type AppSession } from '../apps/session.js';
import { isRecord } from '../core/catalog.js';
import { errorMessage, requireCondition } from '../core/errors.js';
import { defaultProfile } from '../core/state.js';
import type { Profile, VirtualFile } from '../core/types.js';

export interface SampleSnapshot {
  name: string;
  text: string;
  dirty: boolean;
  busy: boolean;
  loaded: boolean;
  desktop: boolean;
  error: string;
  message: string;
  route: string;
  location: string;
  accent: 'blue' | 'violet';
  theme: Profile['theme'];
  scale: number;
  reducedMotion: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export class FrameworkDocument {
  private readonly doc = new EditorDocument();
  private readonly navigation: AppNavigation;
  private readonly initialFileId: string | null;
  private readonly lifetime = new AbortController();
  private readonly cleanups: (() => void)[] = [];
  private readonly listeners = new Set<() => void>();
  private view: SampleSnapshot;
  private disposed = false;

  get snapshot(): SampleSnapshot {
    return this.view;
  }

  constructor(
    private readonly session: AppSession | null,
    readonly label: string
  ) {
    this.navigation = session?.navigation ?? new AppNavigation('/', () => this.publish());
    const fromProps = session?.client.context.props['fileId'];
    this.initialFileId =
      parseEditorRoute(this.navigation.state.route).fileId ?? (typeof fromProps === 'string' ? fromProps : null);
    const profile = session?.profile ?? defaultProfile('windows');
    this.view = {
      name: this.doc.name,
      text: '',
      dirty: false,
      busy: false,
      desktop: session !== null,
      loaded: this.initialFileId === null,
      error: '',
      message: '编辑文本，再保存到桌面或下载到本机。',
      route: this.navigation.state.route,
      location: this.navigation.state.route,
      accent: 'blue',
      theme: profile.theme,
      scale: profile.scale,
      reducedMotion: profile.reducedMotion,
      canUndo: false,
      canRedo: false
    };
    this.cleanups.push(
      this.navigation.bind(async (route, signal) => {
        const target = parseEditorRoute(route);
        requireCondition(!this.view.busy, 'BUSY', '请先完成当前文档操作');
        if (target.fileId === null || target.fileId === this.doc.fileId) return;
        requireCondition(!this.doc.dirty, 'DIRTY', '请先保存当前文档，再打开其他文件');
        requireCondition(this.session, 'UNAVAILABLE', '桌面托管文件不可用');
        await this.doc.open(
          () => this.session!.request<VirtualFile>('files.read', { id: target.fileId }),
          AbortSignal.any([signal, this.lifetime.signal])
        );
        this.publish();
        await this.sync();
      })
    );
    if (!session) return;
    this.cleanups.push(
      session.subscribe(() => this.publish()),
      session.bindSuspension(() => !this.doc.dirty && !this.view.busy),
      session.client.onRequest('document.prepareClose', () => ({ dirty: this.doc.dirty })),
      session.client.onRequest('document.save', () => this.save()),
      session.client.onRequest('document.discard', async () => {
        this.doc.discard();
        this.publish({ error: '', message: '已放弃未保存修改' });
        await this.sync();
        return true;
      }),
      session.client.onRequest('command', payload => {
        requireCondition(isRecord(payload), 'INVALID', '窗口命令格式无效');
        const command = payload['id'];
        if (command === 'save') return this.save();
        requireCondition(command === 'undo' || command === 'redo', 'UNSUPPORTED', '此便签不支持该窗口命令');
        if (command === 'undo') this.undo();
        else this.redo();
        return true;
      })
    );
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async start(): Promise<void> {
    await this.perform(async () => {
      if (this.initialFileId && !this.view.loaded) {
        requireCondition(this.session, 'UNAVAILABLE', '桌面托管文件不可用');
        await this.doc.open(
          () => this.session!.request<VirtualFile>('files.read', { id: this.initialFileId }),
          this.lifetime.signal
        );
        if (parseEditorRoute(this.navigation.state.route).fileId !== this.doc.fileId)
          this.navigation.record(documentRoute(this.doc.fileId!), true);
        this.publish({ loaded: true });
      }
    }, '编辑文本，再保存到桌面或下载到本机。');
  }

  edit(text: string): void {
    this.change(() => this.doc.edit(text));
  }
  rename(name: string): void {
    this.change(() => this.doc.rename(name));
  }
  undo(): void {
    this.change(() => this.doc.undo());
  }
  redo(): void {
    this.change(() => this.doc.redo());
  }
  report(error: unknown): void {
    this.publish({ error: errorMessage(error) });
  }
  setLocation(location: string): void {
    this.publish({ location });
  }
  toggleAccent(): void {
    this.publish({ accent: this.view.accent === 'blue' ? 'violet' : 'blue' });
  }

  async navigate(): Promise<void> {
    try {
      await this.navigation.go({ type: 'push', route: this.view.location }, this.lifetime.signal);
      this.publish({ error: '', location: this.navigation.state.route });
    } catch (error) {
      this.publish({ error: errorMessage(error) });
    }
  }

  async save(): Promise<boolean> {
    if (!this.session) {
      this.publish({ error: 'UNAVAILABLE: 桌面托管文件不可用，请使用下载文本。' });
      return false;
    }
    if (!this.view.loaded) {
      this.publish({ error: 'NOT_READY: 请先完成原文档读取' });
      return false;
    }
    return this.perform(async () => {
      await this.doc.save(snapshot =>
        snapshot.fileId ?
          this.session!.request<VirtualFile>('files.write', {
            id: snapshot.fileId,
            revision: snapshot.revision,
            name: snapshot.name,
            bytes: snapshot.bytes
          })
        : this.session!.request<VirtualFile>('files.create', {
            name: snapshot.name,
            parentId: null,
            bytes: snapshot.bytes,
            mime: snapshot.name.endsWith('.md') ? 'text/markdown' : 'text/plain'
          })
      );
      if (!this.disposed) this.navigation.record(documentRoute(this.doc.fileId!), true);
    }, '已保存到我的文件');
  }

  async copy(): Promise<void> {
    await this.perform(async () => {
      requireCondition(this.session, 'UNAVAILABLE', '桌面剪贴板能力不可用');
      await this.session.request('clipboard.write', { text: this.doc.text });
    }, '已复制全文');
  }

  async check(): Promise<void> {
    await this.perform(async () => {
      requireCondition(this.session, 'UNAVAILABLE', '桌面确认能力不可用');
      const confirmed = await this.session.confirm('检查当前内容', '确认只检查当前便签，不会保存或删除内容。');
      requireCondition(confirmed, 'CANCELLED', '检查已取消，正文保持不变');
    }, '检查已确认，正文保持不变');
  }

  exportText(): void {
    download(this.doc.name, new TextEncoder().encode(this.doc.text), 'text/plain;charset=utf-8');
    this.publish({ message: '已交付浏览器下载，请检查下载位置', error: '' });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifetime.abort();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.listeners.clear();
  }

  private change(operation: () => void): void {
    if (this.disposed) return;
    operation();
    this.publish();
    void this.sync().catch(error => this.publish({ error: errorMessage(error) }));
  }

  private async perform(operation: () => Promise<void>, message: string): Promise<boolean> {
    if (this.disposed) return false;
    if (this.view.busy) {
      this.publish({ error: 'BUSY: 请先完成当前文档操作' });
      return false;
    }
    this.publish({ busy: true, error: '' });
    try {
      await operation();
      if (this.disposed) return false;
      await this.sync();
      this.publish({ message, error: '' });
      return true;
    } catch (error) {
      this.publish({ error: errorMessage(error) });
      return false;
    } finally {
      this.publish({ busy: false });
    }
  }

  private async sync(): Promise<void> {
    if (!this.session || this.disposed) return;
    await this.session.update({
      title: `${this.doc.name}${this.doc.dirty ? ' · 未保存' : ''}`,
      dirty: this.doc.dirty,
      fileId: this.doc.fileId,
      commands: [
        { id: 'save', label: '保存', disabled: false },
        { id: 'undo', label: '撤销', disabled: !this.doc.canUndo },
        { id: 'redo', label: '重做', disabled: !this.doc.canRedo }
      ]
    });
  }

  private publish(patch: Partial<SampleSnapshot> = {}): void {
    if (this.disposed) return;
    const profile = this.session?.profile ?? defaultProfile('windows');
    const route = this.navigation.state.route;
    this.view = {
      ...this.view,
      name: this.doc.name,
      text: this.doc.text,
      dirty: this.doc.dirty,
      canUndo: this.doc.canUndo,
      canRedo: this.doc.canRedo,
      route,
      location: route === this.view.route ? this.view.location : route,
      theme: profile.theme,
      scale: profile.scale,
      reducedMotion: profile.reducedMotion,
      ...patch
    };
    for (const listener of this.listeners) listener();
  }
}
