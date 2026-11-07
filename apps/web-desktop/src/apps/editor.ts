import { decodeText, encodeText } from '../core/bytes.js';
import { requireCondition } from '../core/errors.js';
import type { VirtualFile } from '../core/types.js';

export interface SaveSnapshot {
  name: string;
  parentId: string | null;
  fileId: string | null;
  revision: number;
  bytes: string;
}

export class EditorDocument {
  private savedText = '';
  private savedName = '未命名.txt';
  private history = [''];
  private cursor = 0;
  text = '';
  name = '未命名.txt';
  parentId: string | null = null;
  fileId: string | null = null;
  revision = 0;

  get dirty(): boolean {
    return this.text !== this.savedText || this.name !== this.savedName;
  }
  get canUndo(): boolean {
    return this.cursor > 0;
  }
  get canRedo(): boolean {
    return this.cursor < this.history.length - 1;
  }

  rename(name: string): void {
    this.name = name;
  }

  edit(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.history = [...this.history.slice(0, this.cursor + 1), text];
    this.cursor = this.history.length - 1;
  }

  undo(): void {
    if (this.canUndo) this.text = this.history[--this.cursor];
  }
  redo(): void {
    if (this.canRedo) this.text = this.history[++this.cursor];
  }

  async open(read: () => Promise<VirtualFile>, signal?: AbortSignal): Promise<void> {
    const { text, name, fileId, revision } = this;
    signal?.throwIfAborted();
    const file = await read();
    signal?.throwIfAborted();
    requireCondition(
      this.text === text && this.name === name && this.fileId === fileId && this.revision === revision,
      'CONFLICT',
      '读取期间文档已变化，当前内容已保留，请完成编辑后重试'
    );
    this.load(file);
  }

  load(file: VirtualFile): void {
    requireCondition(
      ['text/plain', 'text/markdown'].includes(file.mime) && file.kind === 'file',
      'UNSUPPORTED',
      '编辑器只打开 UTF-8 纯文本与 Markdown 源文'
    );
    this.text = decodeText(file.bytes);
    this.name = file.name;
    this.fileId = file.id;
    this.parentId = file.parentId;
    this.revision = file.revision;
    this.savedText = this.text;
    this.savedName = this.name;
    this.history = [this.text];
    this.cursor = 0;
  }

  discard(): void {
    this.text = this.savedText;
    this.name = this.savedName;
    this.history = [this.text];
    this.cursor = 0;
  }

  async save(
    commit: (snapshot: SaveSnapshot) => Promise<VirtualFile>,
    saveAs = false,
    destination?: { name: string; parentId: string | null }
  ): Promise<void> {
    const originalName = this.name;
    const snapshot = {
      name: destination?.name ?? this.name,
      parentId: destination ? destination.parentId : this.parentId,
      fileId: saveAs ? null : this.fileId,
      revision: this.revision,
      bytes: encodeText(this.text)
    };
    const file = await commit(snapshot);
    if (this.name === originalName) this.name = snapshot.name;
    this.fileId = file.id;
    this.revision = file.revision;
    this.parentId = file.parentId;
    this.savedText = decodeText(snapshot.bytes);
    this.savedName = snapshot.name;
  }
}
