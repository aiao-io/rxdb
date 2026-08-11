import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, PLATFORM_ID } from '@angular/core';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class HomePage {
  // P2-5：原先还注入了从未使用的 `rxdb`，并实现了一个只有 `if (!this.isBrowser) return;`
  // 的空 `ngOnInit` —— 后者让人以为这里有 SSR 相关的初始化，实际什么都没做。
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
}
