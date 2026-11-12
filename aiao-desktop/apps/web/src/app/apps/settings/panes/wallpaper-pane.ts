import { Component, inject } from '@angular/core';

import { SystemState } from '../../../services/system-state';
import { WALLPAPERS, WALLPAPER_KEYS, WallpaperService, wallpaperThumb } from '../../../services/wallpaper';
import { ToggleSwitch } from '../toggle-switch';

/** 壁纸：缩略图网格（点一下就换）与两个只改外观的开关。 */
@Component({
  selector: 'app-wallpaper-pane',
  imports: [ToggleSwitch],
  host: { style: 'display: contents' },
  template: `
    <div class="st-label">Desktop picture</div>
    <div class="st-group">
      <div class="wp-grid">
        @for (paper of papers; track paper.key) {
          <div
            class="wp"
            [attr.data-wp]="paper.key"
            [class.on]="system.wallpaper() === paper.key"
            [style.background-image]="paper.image"
            (click)="wallpaper.set(paper.key)"
            (keydown.enter)="wallpaper.set(paper.key)"
            tabindex="-1"
          >
            <span>{{ paper.name }}</span>
          </div>
        }
      </div>
    </div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Show on all Spaces</div>
        <div class="rt"><div [appSwitch]="true" data-k="spaces"></div></div>
      </div>
      <div class="st-item">
        <div class="lb">Add wallpaper to Photos</div>
        <div class="rt"><div [appSwitch]="false" data-k="addp"></div></div>
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
    image: `url('${wallpaperThumb(WALLPAPERS[key], 420)}')`
  }));
}
