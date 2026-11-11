import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-boot-screen',
  templateUrl: './boot-screen.html',
  styleUrl: './boot-screen.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class BootScreen {}
