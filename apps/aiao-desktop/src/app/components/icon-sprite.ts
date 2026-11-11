import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-icon-sprite',
  templateUrl: './icon-sprite.html',
  styleUrl: './icon-sprite.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class IconSprite {}
