import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal
} from '@angular/core';

import { ImageThumbnailCache } from '../services/image-thumbnail-cache';
import { Icon } from './icon';

/** 进入视野的图片才读取或生成缩略图。 */
@Component({
  selector: 'app-file-thumbnail',
  imports: [Icon],
  template: `
    @if (preview(); as image) {
      <img [src]="image.url" (error)="imageFailed(image)" alt="" data-thumbnail draggable="false" />
    } @else {
      <svg appIcon="f-img"></svg>
    }
  `,
  styles: `
    :host,
    img,
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    img {
      object-fit: contain;
      border-radius: 3px;
    }
  `
})
export class FileThumbnail {
  private readonly cache = inject(ImageThumbnailCache);
  private readonly visible = signal(false);
  private readonly loaded = signal<{ readonly id: string; readonly url: string } | null>(null);

  protected readonly preview = computed(() => {
    const image = this.loaded();
    return image?.id === this.contentId() ? image : null;
  });
  readonly contentId = input.required<string | undefined>();

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        this.visible.set(true);
        observer.disconnect();
      });
      observer.observe(host);
      destroy.onDestroy(() => observer.disconnect());
    });
    effect(onCleanup => {
      const id = this.contentId();
      if (!id || !this.visible()) return;
      let current = true;
      onCleanup(() => {
        current = false;
      });
      void this.cache.get(id).then(url => {
        if (current && this.contentId() === id) this.loaded.set(url ? { id, url } : null);
      });
    });
  }

  protected imageFailed(image: { readonly id: string; readonly url: string }): void {
    if (this.preview() !== image) return;
    this.loaded.set(null);
    void this.cache.remove(image.id);
  }
}
