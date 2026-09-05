import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFakePanelHost, type FakePanelHost } from '../testing';
import { DEVTOOLS_HOST_ACCESS, type DevToolsHostAccessState } from '../transport';
import { ConnectionGuardComponent } from './connection-guard.component';

@Component({
  imports: [ConnectionGuardComponent],
  template: `<app-connection-guard><p id="payload">guarded content</p></app-connection-guard>`
})
class GuardHostComponent {}

/**
 * US-906 AC#4：`unsupported` 分支必须给**原因**，而不是只给结论。
 *
 * @remarks
 * 面板是三宿主共享 library，这个分支在浏览器端（`chrome://` 之类的内部页）与桌面端
 * （自定义 scheme 的打包入口）都会出现，所以文案只描述「协议不支持」这一事实，
 * **不得写死某个宿主**——写死 Electron 会让浏览器用户读到一句与自己无关的话。
 */
describe('ConnectionGuardComponent', () => {
  let host: FakePanelHost;
  let fixture: ComponentFixture<GuardHostComponent>;

  const render = async (state: DevToolsHostAccessState): Promise<string> => {
    host.hostAccess.state.set(state);
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  };

  beforeEach(async () => {
    host = createFakePanelHost();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ...host.providers,
        { provide: DEVTOOLS_HOST_ACCESS, useValue: host.hostAccess }
      ]
    });
    fixture = TestBed.createComponent(GuardHostComponent);
    await fixture.whenStable();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('names the injectable scheme set as the reason', async () => {
    const text = await render('unsupported');

    // 结论仍在：状态没有被改写成别的分支。
    expect(text).toContain('不支持扩展注入');
    // 原因给全：合法 scheme 集逐个列出，开发者据此一眼判断自己这一页属不属于其中。
    for (const scheme of ['http', 'https', 'file', 'ftp']) expect(text).toContain(scheme);
  });

  it('keeps the wording host-neutral', async () => {
    const text = await render('unsupported');

    // 三个宿主名一个都不许出现：同一句话要同时对浏览器、Electron、Tauri 的用户成立。
    for (const host of ['Electron', 'Tauri', 'electron', 'tauri']) expect(text).not.toContain(host);
  });

  it('withholds the guarded content while unsupported, even once connected', async () => {
    // 「连上了」不能让这个分支放行：协议不支持时页面里根本没有 connector，
    // 一旦放行，面板会从诚实的「不支持」变成永远空转的数据页。
    TestBed.inject(DEVTOOLS_HOST_ACCESS);
    const text = await render('unsupported');

    expect(text).not.toContain('guarded content');
  });

  it('renders the guarded content once granted and connected', async () => {
    const text = await render('granted');

    // `granted` 但未连接时是等待态；这里只验守卫本身没有把内容永久扣住。
    expect(text).not.toContain('不支持扩展注入');
  });
});
