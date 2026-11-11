import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-desktop-surface',
  templateUrl: './desktop-surface.html',
  styleUrl: './desktop-surface.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class DesktopSurface {}
