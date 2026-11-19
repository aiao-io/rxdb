import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';

import { DiskPath } from '../disk/disk-path';
import { FileImport } from '../services/file-import';
import { Toast } from '../services/toast';

/** 拖入阶段只能判断类型，文件只能在 drop 回调中同步取出。 */
export function fileTransfer(event: DragEvent): DataTransfer | null {
  const data = event.dataTransfer;
  return data?.types.includes('Files') ? data : null;
}

/** 接收本机文件。`null` 阻止落入父目录，`undefined` 让文件条目沿用外层目录。 */
@Directive({
  selector: '[appFileDrop]',
  host: {
    '[class.file-drop-active]': 'imports.dropTarget() === element',
    '(dragover)': 'over($event)',
    '(dragleave)': 'leave($event)',
    '(drop)': 'drop($event)'
  }
})
export class FileDrop {
  protected readonly imports = inject(FileImport);
  protected readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly toast = inject(Toast);
  readonly appFileDrop = input.required<DiskPath | null | undefined>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  protected over(event: DragEvent): void {
    const dir = this.appFileDrop();
    const data = fileTransfer(event);
    if (dir === undefined || !data) return;
    event.preventDefault();
    event.stopPropagation();
    const accepts = this.imports.accepts(dir);
    data.dropEffect = accepts ? 'copy' : 'none';
    this.imports.dropTarget.set(accepts ? this.element : null);
  }

  protected leave(event: DragEvent): void {
    if (event.relatedTarget instanceof Node && this.element.contains(event.relatedTarget)) return;
    this.clear();
  }

  protected drop(event: DragEvent): void {
    const dir = this.appFileDrop();
    const data = fileTransfer(event);
    if (dir === undefined || !data) return;
    event.preventDefault();
    event.stopPropagation();
    this.imports.dropTarget.set(null);
    if (!this.imports.accepts(dir)) return;
    if (Array.from(data.items).some(item => item.kind === 'file' && item.webkitGetAsEntry()?.isDirectory)) {
      this.toast.show('Drop files without folders.');
      return;
    }
    void this.imports.importFiles(dir, Array.from(data.files));
  }

  private clear(): void {
    if (this.imports.dropTarget() === this.element) this.imports.dropTarget.set(null);
  }
}
