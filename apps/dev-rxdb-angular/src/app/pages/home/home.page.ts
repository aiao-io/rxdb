import { RxDB } from '@aiao/rxdb';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { BaseSrcPipe } from '../../pipes/base-src.pipe';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseSrcPipe]
})
export default class HomePage implements OnInit {
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  rxdb = inject(RxDB);

  ngOnInit() {
    if (!this.isBrowser) return;
  }
}
