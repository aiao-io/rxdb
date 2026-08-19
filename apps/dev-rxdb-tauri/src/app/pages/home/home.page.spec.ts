import { RxDB } from '@aiao/rxdb';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EMPTY, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RxDBConnectionState } from '../../rxdb-connection-state';
import { TauriService } from '../../services/tauri.service';
import { resolveLocalBackend } from '../../setup_rxdb';
import HomePage from './home.page';

vi.mock('@aiao/utils', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/utils')>()),
  checkOPFSAvailable: vi.fn(async () => true)
}));

class TauriServiceStub {
  isTauri = true;
  getPlatform = vi.fn(async () => 'macos');
  getVersions = vi.fn(async () => ({ tauri: '2.9.1' }));
  checkRuntime = vi.fn(async () => ({ status: 'ready' }));
}

let tauri: TauriServiceStub;
let connectionState: RxDBConnectionState;

const render = async (localAdapter$ = of({})): Promise<ComponentFixture<HomePage>> => {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: RxDB, useValue: { localAdapter$ } },
      { provide: TauriService, useValue: tauri },
      { provide: RxDBConnectionState, useValue: connectionState }
    ]
  });
  const fixture = TestBed.createComponent(HomePage);
  await fixture.whenStable();
  // `ngOnInit` 里的 IPC/OPFS 探测是裸 Promise，没走 `PendingTasks`，
  // `whenStable()` 不会等它们 —— 先放掉一轮宏任务，再让变更检测跑一次。
  await new Promise(resolve => setTimeout(resolve));
  await fixture.whenStable();
  return fixture;
};

const textOf = (fixture: ComponentFixture<HomePage>): string => fixture.nativeElement.textContent ?? '';

/** 按 `data-testid` 取一格文本；取不到就是 `null`，好和"这格根本没渲染"区分开。 */
const testId = (fixture: ComponentFixture<HomePage>, id: string): string | null =>
  fixture.nativeElement.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null;

describe('HomePage', () => {
  beforeEach(() => {
    tauri = new TauriServiceStub();
    connectionState = new RxDBConnectionState();
  });

  afterEach(() => TestBed.resetTestingModule());

  // TAURI-01：这块诊断面板原本**永远到不了** —— 连接失败会在 app initializer 里
  // reject 并中止 bootstrap，组件树根本不渲染。把失败降级成应用内状态之后，
  // 面板才第一次可达；这条测试钉住的就是"可达"本身。
  it('renders the bootstrap failure inside the page instead of a blank window', async () => {
    connectionState.markFailed(new Error('OPFS 不可用'));
    const fixture = await render(EMPTY);

    expect(fixture.nativeElement.querySelector('.alert-error')).not.toBeNull();
    expect(textOf(fixture)).toContain('OPFS 不可用');
  });

  it('renders the connected badge once the local adapter resolves', async () => {
    const fixture = await render();

    expect(textOf(fixture)).toContain('已连接');
    expect(fixture.nativeElement.querySelector('.alert-error')).toBeNull();
  });

  it('renders a later adapter failure as an in-page error', async () => {
    const fixture = await render(throwError(() => new Error('worker 已退出')));

    expect(textOf(fixture)).toContain('worker 已退出');
    expect(testId(fixture, 'rxdb-error')).toBe('worker 已退出');
  });

  /**
   * US-207 E9：这两格此前是模板里写死的 `wa-sqlite`，在 Tauri 窗口里**永远是错的**。
   *
   * 断言比的是 `selectLocalBackend` 的判定结果本身，而不是另写一遍 `'wa-sqlite'` 字面量 ——
   * 后者会在"模板与判定各说各话"时照样通过，正是它要防的那个 bug。
   */
  it('shows the backend actually selected for this run, not a hardcoded name', async () => {
    const fixture = await render();
    const selected = resolveLocalBackend(globalThis);

    expect(testId(fixture, 'rxdb-backend')).toBe(selected.adapter);
    expect(testId(fixture, 'rxdb-db-name')).toBe(selected.dbName);
  });

  it('renders the tauri version reported over IPC', async () => {
    const fixture = await render();
    const text = textOf(fixture);

    expect(text).toContain('Rust 后端已连接');
    expect(text).toContain('macos');
    expect(text).toContain('2.9.1');
  });

  // P2：`check_runtime` 原本被塞进 `Promise.all` 却从不读返回值 —— 后端报告任何
  // 非 ready 状态都会被当成健康。既然要调它，就得让它的结论影响页面。
  it('surfaces a runtime status other than ready as an IPC error', async () => {
    tauri.checkRuntime = vi.fn(async () => ({ status: 'degraded' }));
    const fixture = await render();
    const text = textOf(fixture);

    expect(text).not.toContain('Rust 后端已连接');
    expect(text).toContain('degraded');
  });

  it('surfaces a rejected IPC call as an error message', async () => {
    tauri.getPlatform = vi.fn(() => Promise.reject(new Error('IPC 通道未就绪')));
    const fixture = await render();

    expect(textOf(fixture)).toContain('IPC 通道未就绪');
  });

  it('renders the browser preview notice outside Tauri', async () => {
    tauri.isTauri = false;
    const fixture = await render();
    const text = textOf(fixture);

    expect(text).toContain('浏览器预览');
    expect(text).toContain('桌面 API 不可用');
    expect(tauri.getVersions).not.toHaveBeenCalled();
  });
});
