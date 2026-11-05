import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DevicesPanel } from './devices-panel';
import { FilesPanel } from './files-panel';
import { TransfersPanel } from './transfers-panel';

/** 日常共享与下载。 */
@Component({
  selector: 'app-share-page',
  imports: [DevicesPanel, FilesPanel, TransfersPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-7">
      <p class="text-primary mb-2 text-xs font-semibold tracking-widest">让文件少绕一点路</p>
      <h1 class="text-3xl font-semibold tracking-tight">文件就在设备之间传</h1>
      <p class="text-base-content/60 mt-3 text-sm leading-relaxed">
        不用数据线。在另一台设备打开本应用并登录，就能发现并下载共享文件。
      </p>
    </div>
    <ol
      class="border-base-300 bg-base-100 mb-7 grid gap-4 rounded-2xl border p-5 text-sm md:grid-cols-3"
      aria-label="使用步骤"
    >
      <li class="flex items-start gap-3">
        <span class="step-number">1</span>
        <div class="pt-1">
          <strong>另一台设备登录</strong>
          <p class="text-base-content/55 mt-1 text-xs">两台设备连接同一局域网</p>
        </div>
      </li>
      <li class="flex items-start gap-3">
        <span class="step-number">2</span>
        <div class="pt-1">
          <strong>选择文件并共享</strong>
          <p class="text-base-content/55 mt-1 text-xs">文件自动出现在对方的列表里</p>
        </div>
      </li>
      <li class="flex items-start gap-3">
        <span class="step-number">3</span>
        <div class="pt-1">
          <strong>下载后保存</strong>
          <p class="text-base-content/55 mt-1 text-xs">点击“保存到下载目录”带走文件</p>
        </div>
      </li>
    </ol>
    <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div class="flex min-w-0 flex-col gap-6"><app-files-panel /><app-transfers-panel /></div>
      <aside aria-label="设备连接"><app-devices-panel /></aside>
    </div>
  `
})
export default class SharePage {}
