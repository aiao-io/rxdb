import { Service, computed, inject, signal } from '@angular/core';

import { Preferences } from '../data/preferences';
import { DESKTOP_APPS, DesktopAppId } from './desktop-apps';
import {
  DockLayout,
  canUnpin,
  defaultLayout,
  isPinnable,
  isPinned,
  move,
  pin,
  repairLayout,
  sameLayout,
  unpin
} from './dock-layout-model';
import { MenuEntry } from './menu';
import { Toast } from './toast';

/** Dock 的固定布局存成偏好表里的一行 JSON。 */
export const DOCK_LAYOUT_KEY = 'dock:layout';

type LayoutChange = (layout: DockLayout) => DockLayout;

/** 偏好里的原始内容可以是任何东西（损坏的、旧版本的），由 `repairLayout` 判断。 */
const anything = (value: unknown): value is unknown => true;

/**
 * Dock 的固定布局：固定项、顺序与分隔线，是系统偏好 `dock:layout`，跨标签页共享（后保存的生效，规则见 ADESK-US-105）。
 * 库读完之前用清单的默认布局；读完后采用已存的布局（先 `repairLayout`，修复过就写回）；之后每次改动都落库。
 * 没有存过布局时不写库，默认布局继续跟着清单走，用户第一次调整 Dock 才存下完整布局。
 *
 * 运行态（本标签页的窗口产生的运行指示与临时图标）不在这里：它只叠加显示，从不进入固定布局。
 */
@Service({ autoProvided: false })
export class DockLayoutStore {
  private readonly manifests = inject(DESKTOP_APPS);
  private readonly preferences = inject(Preferences);
  private readonly toast = inject(Toast);
  private readonly layoutState = signal<DockLayout>(defaultLayout(this.manifests));
  /** 库读完之前用户做的改动；读完后在已存的布局上依次重放。读完（`null`）之后直接落库。 */
  private pending: LayoutChange[] | null = [];

  readonly layout = this.layoutState.asReadonly();
  /** 当前布局的有序项：固定应用与分隔线。 */
  readonly items = computed(() => this.layoutState().items);

  constructor() {
    this.preferences.ready.then(
      () => this.restore(),
      () => undefined
    );
  }

  pinned(appId: DesktopAppId): boolean {
    return isPinned(this.layoutState(), appId);
  }

  /** 能不能固定到 Dock（有 `.app` 身份，或本来就是 Dock 的系统入口）。 */
  pinnable(appId: DesktopAppId): boolean {
    return isPinnable(this.manifests, appId);
  }

  /** 已固定、且清单允许移除；系统入口与 Finder 不能。 */
  canUnpin(appId: DesktopAppId): boolean {
    return canUnpin(this.layoutState(), appId, this.manifests);
  }

  /** 固定一个应用，`index` 不给就放在应用区末尾；返回布局有没有变化（已固定或不能固定时没有）。 */
  pin(appId: DesktopAppId, index?: number): boolean {
    return this.change(layout => pin(layout, appId, index, this.manifests));
  }

  /** 取消固定（应用本体不受影响）；不可移除的固定项被拒绝，返回 false。 */
  unpin(appId: DesktopAppId): boolean {
    return this.change(layout => unpin(layout, appId, this.manifests));
  }

  /** 调整固定应用的顺序，`index` 是取出该应用之后的插入位置。 */
  move(appId: DesktopAppId, index: number): boolean {
    return this.change(layout => move(layout, appId, index, this.manifests));
  }

  /**
   * 右键菜单里的 Dock 项，Dock 与 Launchpad 共用：已固定显示 `Remove from Dock`（不可移除的置灰），
   * 否则显示 `Add to Dock`（不能固定的置灰）。菜单与拖放走同一套 `pin` / `unpin`，结果一致。
   * `before` 在布局改动之前调用，调用方用它记下改动前的状态（比如键盘焦点该落在哪个图标）。
   */
  menuEntry(appId: DesktopAppId, before?: () => void): MenuEntry {
    if (this.pinned(appId)) {
      return {
        id: 'remove-from-dock',
        label: 'Remove from Dock',
        disabled: !this.canUnpin(appId),
        run: () => {
          before?.();
          this.unpin(appId);
        }
      };
    }
    return {
      id: 'add-to-dock',
      label: 'Add to Dock',
      disabled: !this.pinnable(appId),
      run: () => {
        before?.();
        this.pin(appId);
      }
    };
  }

  private change(update: LayoutChange): boolean {
    const current = this.layoutState();
    const next = update(current);
    if (next === current) return false;
    this.layoutState.set(next);
    if (this.pending) this.pending.push(update);
    else this.save(next);
    return true;
  }

  private restore(): void {
    const stored = this.preferences.get(DOCK_LAYOUT_KEY, anything);
    const base = repairLayout(stored, this.manifests);
    const layout = (this.pending ?? []).reduce((current, update) => update(current), base);
    this.pending = null;
    this.layoutState.set(layout);
    /* 没存过布局时，与默认布局一致就不必写库；存过的内容与最终布局不一致（被修复，或有读完之前的改动）就写回。 */
    const baseline = stored === undefined ? defaultLayout(this.manifests) : stored;
    if (!sameLayout(baseline, layout)) this.save(layout);
  }

  private save(layout: DockLayout): void {
    this.preferences.set(DOCK_LAYOUT_KEY, layout).catch(() => this.toast.show('Couldn’t save the Dock layout.'));
  }
}
