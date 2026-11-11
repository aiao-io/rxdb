import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-window-layer',
  templateUrl: './window-layer.html',
  styleUrl: './window-layer.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class WindowLayer {}
