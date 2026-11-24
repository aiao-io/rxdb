import { Component, inject } from '@angular/core';

import { SystemState } from '../../../services/system-state';
import { WALLPAPERS, WALLPAPER_KEYS, WallpaperService, wallpaperThumb } from '../../../services/wallpaper';

/** 壁纸：缩略图网格（点一下就换）。 */
@Component({
  selector: 'app-wallpaper-pane',
  host: { style: 'display: contents' },
  template: `
    <div class="st-label">Desktop picture</div>
    <div class="st-group">
      <div class="wp-grid">
        @for (paper of papers; track paper.key) {
          <button
            class="wp"
            [attr.aria-pressed]="system.wallpaper() === paper.key"
            [attr.data-wp]="paper.key"
            [class.on]="system.wallpaper() === paper.key"
            [style.background-image]="paper.image"
            (click)="wallpaper.set(paper.key)"
            tabindex="0"
            type="button"
          >
            <span>{{ paper.name }}</span>
          </button>
        }
      </div>
    </div>
  `
})
export class WallpaperPane {
  protected readonly system = inject(SystemState);
  protected readonly wallpaper = inject(WallpaperService);
  protected readonly papers = WALLPAPER_KEYS.map(key => ({
    key,
    name: WALLPAPERS[key].name,
    image: `url('${wallpaperThumb(WALLPAPERS[key])}')`
  }));
}
