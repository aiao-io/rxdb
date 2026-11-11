import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-overlay-layer',
  templateUrl: './overlay-layer.html',
  styleUrl: './overlay-layer.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class OverlayLayer {}
