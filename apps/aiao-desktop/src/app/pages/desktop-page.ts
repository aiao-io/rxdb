import { Component, ViewEncapsulation } from '@angular/core';
import { DesktopShell } from '../components/desktop-shell';

@Component({
  selector: 'app-desktop-page',
  imports: [DesktopShell],
  templateUrl: './desktop-page.html',
  styleUrl: './desktop-page.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"block"',
    '[style.width]': '"100%"',
    '[style.height]': '"100%"'
  }
})
export class DesktopPage {}
