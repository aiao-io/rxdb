import { RxDB } from '@aiao/rxdb';
import { CatalogItem } from '@aiao/rxdb-test/entities';
import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import type { CatalogItemChanges, CatalogItemDraft } from './catalog-remote';
import { CatalogRemoteState } from './catalog-remote-state';

/**
 * 本机商品的写入、撤销/重做与推送（US-034）。
 *
 * @remarks
 * 改动先落在本机：留下可撤销的变更，离线也能改；推送经 `rxdb_mutations`，服务端按写后的行算区、按 RLS 裁决，
 * 被拒的修改在本地对齐成远端的样子，清单见「被拒的推送」。推送之后、或拉到别人的修改之后，之前的修改不能再撤销。
 *
 * 撤销/重做只作用于商品（`history(CatalogItem)`），不会撤到别的页面的数据。待推数与推送是整个本机的：
 * 按仓库的同步状态要向远端查待拉数，离线时查不出来，本机的待推数只有整库这一份，推送的范围跟它对齐。
 *
 * 写入口只对所在租户开放：访客只读公开数据（实体权限分不出身份，访客就算在本机写了也推不上去，US-225）；
 * 不在租户里的登录身份没有可写的商品。能不能写最终由服务端裁决，这里只决定入口给不给。
 */
@Injectable()
export class CatalogLocalWrites {
  readonly #rxdb = inject(RxDB);
  readonly #session = inject(DemoSession);
  readonly #remote = inject(CatalogRemoteState);
  readonly #history = this.#rxdb.versionManager.history(CatalogItem);
  readonly #busy = signal(false);
  readonly #error = signal<string | null>(null);
  readonly #notice = signal<string | null>(null);

  /** 能撤销的商品修改 */
  readonly $undoCount = toSignal(this.#history.undoCount$, { initialValue: 0 });
  /** 能重做的商品修改 */
  readonly $redoCount = toSignal(this.#history.redoCount$, { initialValue: 0 });
  /** 本机还没推送的修改，与「推送」的范围一致 */
  readonly $pending = toSignal(this.#rxdb.versionManager.pushableCount$, { initialValue: 0 });
  /** 正在写本机或推送 */
  readonly $busy = this.#busy.asReadonly();
  /** 上一次操作失败的原因 */
  readonly $error = this.#error.asReadonly();
  /** 上一次操作的结果 */
  readonly $notice = this.#notice.asReadonly();
  /** 当前身份能在本机改商品：登录了，且在至少一个租户里 */
  readonly $canWrite = computed(() => this.#session.signedIn && this.#remote.$myTenantIds().length > 0);

  /** 这件商品能不能改：只有所在租户的商品 */
  canEdit(item: Pick<CatalogItem, 'tenantId'>): boolean {
    return this.$canWrite() && this.#remote.$myTenantIds().includes(item.tenantId);
  }

  create(draft: CatalogItemDraft): Promise<void> {
    return this.#run(`「${draft.name}」已在本机新建`, () =>
      this.#rxdb.entityManager.instantiate(CatalogItem, { ...draft }).save()
    );
  }

  update(item: CatalogItem, changes: CatalogItemChanges): Promise<void> {
    return this.#write(item, `「${changes.name}」已在本机修改`, () => Object.assign(item, changes).save());
  }

  setVisibility(item: CatalogItem, visibility: CatalogItem['visibility']): Promise<void> {
    const label = visibility === 'public' ? '改为公开' : '收回为租户内部';
    return this.#write(item, `「${item.name}」已在本机${label}`, () => Object.assign(item, { visibility }).save());
  }

  remove(item: CatalogItem): Promise<void> {
    return this.#write(item, `「${item.name}」已在本机删除`, () => item.remove());
  }

  undo(): Promise<void> {
    return this.#run('已撤销上一次修改', () => this.#history.undo());
  }

  redo(): Promise<void> {
    return this.#run('已重做', () => this.#history.redo());
  }

  /** 推送本机的修改；被拒的在本地对齐，失败的仓库照实报出来 */
  push(): Promise<void> {
    return this.#run(null, async () => {
      const result = await this.#rxdb.syncManager.push();
      const [failure] = result.failures;
      if (failure) throw failure.error;
      const rejected = result.rejected > 0 ? `，${result.rejected} 条被拒（见「被拒的推送」）` : '';
      this.#notice.set(`推送完成：远端接受 ${result.pushed} 条${rejected}。已推送的修改不能再撤销。`);
    });
  }

  /** 改一件已经在列表里的商品：失败时把没存进去的改动还原 */
  #write(item: CatalogItem, notice: string, action: () => Promise<unknown>): Promise<void> {
    return this.#run(notice, async () => {
      try {
        await action();
      } catch (error) {
        item.reset();
        throw error;
      }
    });
  }

  async #run(notice: string | null, action: () => Promise<unknown>): Promise<void> {
    this.#busy.set(true);
    this.#error.set(null);
    this.#notice.set(null);
    try {
      await action();
      if (notice) this.#notice.set(notice);
    } catch (error) {
      this.#error.set(getErrorMessage(error, '操作失败'));
    } finally {
      this.#busy.set(false);
    }
  }
}
