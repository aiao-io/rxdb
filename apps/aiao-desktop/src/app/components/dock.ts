import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-dock',
  templateUrl: './dock.html',
  styleUrl: './dock.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class Dock {}
