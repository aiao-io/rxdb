import { DialogRef } from '@angular/cdk/dialog';
import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal
} from '@angular/core';

/**
 * 对话框外壳组件（CDK Dialog 内使用）：支持拖拽（CdkDrag）、8 向缩放与全屏切换。
 */
@Component({
  selector: 'rxdb-entity-dialog',
  imports: [CdkDragHandle],
  hostDirectives: [{ directive: CdkDrag, inputs: ['cdkDragBoundary'] }],
  templateUrl: './entity-dialog.component.html',
  styleUrl: './entity-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntityDialogComponent implements AfterViewInit {
  readonly #dialogRef = inject(DialogRef, { optional: true });
  readonly #cdkDrag = inject(CdkDrag, { optional: true, self: true });
  readonly #el = inject(ElementRef) as ElementRef<HTMLElement>;
  readonly #doc = inject(DOCUMENT);

  #pane: HTMLElement | null = null;
  #resizing = false;
  #savedPaneState: { left: string; top: string; width: string; height: string } | null = null;

  readonly title = input.required<string>();
  readonly closeRequested = output<void>();

  readonly isFullscreen = signal(false);
  readonly isInDialog = !!inject(DialogRef, { optional: true });

  constructor() {
    if (this.#cdkDrag) {
      if (this.isInDialog) {
        this.#cdkDrag.rootElementSelector = '.cdk-overlay-pane';
        this.#cdkDrag.boundaryElement = '.cdk-overlay-container';
      } else {
        this.#cdkDrag.disabled = true;
      }
    }
  }

  ngAfterViewInit(): void {
    if (!this.isInDialog) return;
    requestAnimationFrame(() => this.#initFixedPane());
  }

  close(): void {
    this.closeRequested.emit();
    this.#dialogRef?.close();
  }

  toggleFullscreen(): void {
    const wasFullscreen = this.isFullscreen();
    this.isFullscreen.set(!wasFullscreen);
    const fullscreen = !wasFullscreen;
    const pane = this.#pane;
    if (!pane) return;

    if (fullscreen) {
      this.#savedPaneState = {
        left: pane.style.left,
        top: pane.style.top,
        width: pane.style.width,
        height: pane.style.height
      };
      pane.style.left = '0';
      pane.style.top = '0';
      pane.style.width = '100vw';
      pane.style.height = '100vh';
      if (this.#cdkDrag) {
        this.#cdkDrag.disabled = true;
        this.#cdkDrag.setFreeDragPosition({ x: 0, y: 0 });
      }
    } else {
      if (this.#savedPaneState) {
        pane.style.left = this.#savedPaneState.left;
        pane.style.top = this.#savedPaneState.top;
        pane.style.width = this.#savedPaneState.width;
        pane.style.height = this.#savedPaneState.height;
        this.#savedPaneState = null;
      }
      if (this.#cdkDrag) this.#cdkDrag.disabled = false;
    }
  }

  startResize(e: MouseEvent, dir: string): void {
    const pane = this.#pane;
    if (!pane || this.#resizing || this.isFullscreen()) return;
    e.preventDefault();
    e.stopPropagation();
    this.#resizing = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = pane.offsetWidth;
    const startH = pane.offsetHeight;
    const startL = parseFloat(pane.style.left) || 0;
    const startT = parseFloat(pane.style.top) || 0;
    const minW = 400;
    const minH = 300;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (dir.includes('e')) pane.style.width = Math.max(minW, startW + dx) + 'px';
      if (dir.includes('w')) {
        const w = Math.max(minW, startW - dx);
        pane.style.width = w + 'px';
        pane.style.left = startL + startW - w + 'px';
      }
      if (dir.includes('s')) pane.style.height = Math.max(minH, startH + dy) + 'px';
      if (dir.includes('n')) {
        const h = Math.max(minH, startH - dy);
        pane.style.height = h + 'px';
        pane.style.top = startT + startH - h + 'px';
      }
    };
    const onUp = () => {
      this.#resizing = false;
      this.#doc.removeEventListener('mousemove', onMove);
      this.#doc.removeEventListener('mouseup', onUp);
    };
    this.#doc.addEventListener('mousemove', onMove);
    this.#doc.addEventListener('mouseup', onUp);
  }

  #initFixedPane(): void {
    const pane = this.#el.nativeElement.closest<HTMLElement>('.cdk-overlay-pane');
    if (!pane) return;
    this.#pane = pane;
    const rect = pane.getBoundingClientRect();
    if (this.#cdkDrag) this.#cdkDrag.setFreeDragPosition({ x: 0, y: 0 });
    pane.style.position = 'fixed';
    pane.style.left = rect.left + 'px';
    pane.style.top = rect.top + 'px';
    pane.style.margin = '0';
    pane.style.maxWidth = 'none';
    pane.style.maxHeight = 'none';
  }
}
