import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-menubar',
  templateUrl: './menubar.html',
  styleUrl: './menubar.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class Menubar {}
