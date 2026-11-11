import { Component, ViewEncapsulation } from '@angular/core';

import { DesktopPage } from './pages/desktop-page';

@Component({
  selector: 'app-root',
  imports: [DesktopPage],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  encapsulation: ViewEncapsulation.None
})
export class App {}
