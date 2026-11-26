import { RxDB } from '@aiao/rxdb';
import { CatalogItem } from '@aiao/rxdb-test/entities';
import { computed, inject, Injectable, signal } from '@angular/core';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import { Toasts } from '../toasts';
import type { CatalogItemChanges, CatalogItemDraft } from './catalog-remote';
import { CatalogRemoteState } from './catalog-remote-state';

/**
 * 本机商品的写入（US-034）。
 *
 * @remarks
 * 改动先落在本机：留下可撤销的变更，离线也能改。撤销、重做（`history(CatalogItem)`，不会撤到别的页面）与整机的推送
 * 由页面登记到顶栏（epic-016）；推送经 `rxdb_mutations`，服务端按写后的行算区、按 RLS 裁决，被拒的修改在本地对齐成
 * 远端的样子，清单在同步中心。推送之后、或拉到别人的修改之后，之前的修改不能再撤销。
 *
 * 写入口只对所在租户开放：访客只读公开数据（实体权限分不出身份，访客就算在本机写了也推不上去，US-225）；
 * 不在租户里的登录身份没有可写的商品。能不能写最终由服务端裁决，这里只决定入口给不给。
 */
@Injectable()
export class CatalogLocalWrites {
  readonly #rxdb = inject(RxDB);
  readonly #session = inject(DemoSession);
  readonly #remote = inject(CatalogRemoteState);
  readonly #toasts = inject(Toasts);
  readonly #busy = signal(false);
  readonly #error = signal<string | null>(null);

  /** 正在写本机 */
  readonly $busy = this.#busy.asReadonly();
  /** 上一次操作失败的原因：留在原处（列表上方与编辑框里），不弹消息——模态的编辑框盖在消息之上 */
  readonly $error = this.#error.asReadonly();
  /** 当前身份能在本机改商品：登录了，且在至少一个租户里 */
  readonly $canWrite = computed(() => this.#session.signedIn && this.#remote.$myTenantIds().length > 0);
  /** 写入口关着的原因：访客只读，不在租户里没有能改的商品；能写时为 `null`（顶栏的撤销、重做据此给原因） */
  readonly $blockedReason = computed(() => {
    if (!this.#session.signedIn) return '访客只读：登录成员才能在本机改商品';
    return this.$canWrite() ? null : '还不在任何租户里：加入租户之后才能改这个租户的商品';
  });

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

  /** 写一次本机；成功弹一条消息，失败把原因留在 {@link CatalogLocalWrites.$error} */
  async #run(notice: string, action: () => Promise<unknown>): Promise<void> {
    this.#busy.set(true);
    this.#error.set(null);
    try {
      await action();
      this.#toasts.show({ kind: 'success', message: notice });
    } catch (error) {
      this.#error.set(getErrorMessage(error, '操作失败'));
    } finally {
      this.#busy.set(false);
    }
  }
}
