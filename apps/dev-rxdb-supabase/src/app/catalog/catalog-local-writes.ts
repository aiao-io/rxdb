import { getEntityMetadata, RxDB } from '@aiao/rxdb';
import { deriveCreateCapability, deriveEntityCapabilities, deriveRowCapabilities } from '@aiao/rxdb-model/headless';
import { CatalogItem } from '@aiao/rxdb-test/entities';
import { computed, inject, Injectable, signal } from '@angular/core';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import { Toasts } from '../toasts';
import type { CatalogItemChanges, CatalogItemDraft } from './catalog-remote';
import { CatalogRemoteState } from './catalog-remote-state';

const ITEM_GONE_MESSAGE = '这件商品已经不在本机了（可能被同步删除，或移出了你能读的范围），这次修改没有保存。';
const STAFF_READONLY = '员工只读';
const GRANTS_UNKNOWN = '还没取到授权：连上远端之后才能改';

/** 商品的元数据：声明了 `tenant:<tenantId>` 作用域与增删改所需的 `edit`（US-234 阶段 B） */
const CATALOG_ITEM = getEntityMetadata(CatalogItem);

/** 商品上决定写不写得了的那个字段（实体声明的作用域属性） */
type Scoped = Pick<CatalogItem, 'tenantId'>;

/**
 * 本机商品的写入（US-034）。
 *
 * @remarks
 * 改动先落在本机：留下可撤销的变更，离线也能改。撤销、重做（`history(CatalogItem)`，不会撤到别的页面）与整机的推送
 * 由页面登记到顶栏（epic-016）；推送经 `rxdb_mutations`，服务端按写后的行算区、按 RLS 裁决，被拒的修改在本地对齐成
 * 远端的样子，清单在同步中心。推送之后、或拉到别人的修改之后，之前的修改不能再撤销。
 *
 * 写入口出自引擎（US-029）：`CatalogItem` 声明一行属于 `tenant:<tenantId>`、增删改都要 `edit`，按行能力由这份声明与
 * 授权快照派生，本页不再自己判。员工能同步、浏览本租户的商品，写入口关着，原因「员工只读」；访客没有租户作用域；
 * 绕过入口直接经公开写入口写，同样当场 `PermissionDeniedError`，不留待推修改。
 * 撤销、重做不按角色禁用：它们是适配器层的回放，不判定；员工本来写不出修改，降权之前留下的修改撤掉正好让本机回到远端的样子。
 * 本机判定只是快速失败，能不能写最终由服务端按 RLS 裁决。
 */
@Injectable()
export class CatalogLocalWrites {
  readonly #rxdb = inject(RxDB);
  readonly #session = inject(DemoSession);
  readonly #remote = inject(CatalogRemoteState);
  readonly #toasts = inject(Toasts);
  readonly #busy = signal(false);
  readonly #error = signal<string | null>(null);
  /** 能力派生的上下文：引擎的授权快照 */
  readonly #context = computed(() => ({ readOnly: this.#rxdb.readOnly, grants: this.#remote.$grantSnapshot() }));

  /** 正在写本机 */
  readonly $busy = this.#busy.asReadonly();
  /** 上一次操作失败的原因：留在原处（列表上方与编辑框里），不弹消息——模态的编辑框盖在消息之上 */
  readonly $error = this.#error.asReadonly();
  /** 当前身份能在本机新建商品：快照里至少一个租户有 create 所需的权限 */
  readonly $canCreate = computed(() => deriveEntityCapabilities(CATALOG_ITEM, this.#context()).canCreate);
  /** 新建表单能选的租户：草稿落在这个租户能建，与写入口判 create 同一条声明、同一份快照 */
  readonly $creatableTenantIds = computed(() =>
    this.#remote
      .$myTenantIds()
      .filter(tenantId => deriveCreateCapability(CATALOG_ITEM, { tenantId }, this.#context()).canCreate)
  );
  /**
   * 撤销、重做关着的原因：访客只读，不在租户里没有能改的商品；成员（员工也算）为 `null`，
   * 顶栏的撤销、重做据此给原因
   */
  readonly $blockedReason = computed(() => {
    if (!this.#session.signedIn) return '访客只读：登录成员才能在本机改商品';
    return this.#remote.$myTenantIds().length > 0 ? null : '还不在任何租户里：加入租户之后才能改这个租户的商品';
  });

  /** 这件商品能不能改（编辑、公开 / 收回，以及看远端变更历史） */
  canEdit(item: Scoped): boolean {
    return deriveRowCapabilities(CATALOG_ITEM, item, this.#context()).canEdit;
  }

  /** 这件商品能不能删 */
  canDelete(item: Scoped): boolean {
    return deriveRowCapabilities(CATALOG_ITEM, item, this.#context()).canDelete;
  }

  /**
   * 这件商品为什么改不了：授权快照还没取到；或所属租户的员工只读。
   * 能改、或者不是这个租户的成员时为 `null`
   */
  readonlyReason(item: Scoped): string | null {
    const { canEdit, editReason } = deriveRowCapabilities(CATALOG_ITEM, item, this.#context());
    if (canEdit) return null;
    if (editReason === 'grants-unknown') return GRANTS_UNKNOWN;
    return this.#remote.$myTenantIds().includes(item.tenantId) ? STAFF_READONLY : null;
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

  /**
   * 记下这次修改没有保存的原因：要改的商品已经不在本机了。
   *
   * @remarks
   * 编辑框开着的时候，同步可能把这件商品从本机移走（被删除，或移出了能读的范围）。没有可写的行，也就没有写入可做：
   * 原因留在 {@link CatalogLocalWrites.$error}，编辑框据此不关并显示它，改动不会悄悄丢掉；
   * 和写入失败一样，下一次写入开始时清掉。
   */
  reportItemGone(): void {
    this.#error.set(ITEM_GONE_MESSAGE);
  }

  /** 清掉上一次操作的失败原因：打开编辑框时调，旧原因不带进新的一次编辑 */
  dismissError(): void {
    this.#error.set(null);
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
