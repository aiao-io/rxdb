import { Component, ViewEncapsulation, inject } from '@angular/core';

import { WallpaperService } from '../services/wallpaper';

/** 壁纸：程序化渐变垫底，照片图层加载完成后淡入覆盖。 */
@Component({
  selector: 'app-wallpaper',
  templateUrl: './wallpaper.html',
  styleUrl: './wallpaper.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class Wallpaper {
  protected readonly wallpaper = inject(WallpaperService);
}
