import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-lock-screen',
  templateUrl: './lock-screen.html',
  styleUrl: './lock-screen.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class LockScreen {}
