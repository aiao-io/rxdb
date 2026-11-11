import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-wallpaper',
  templateUrl: './wallpaper.html',
  styleUrl: './wallpaper.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class Wallpaper {}
