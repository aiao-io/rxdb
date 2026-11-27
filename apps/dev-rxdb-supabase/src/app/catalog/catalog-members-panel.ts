import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import { Toasts } from '../toasts';
import { ADMIN_PERMISSIONS, roleLabel, samePermissions, STAFF_PERMISSIONS, tenantGrants } from './catalog-permissions';
import { fetchTenantMembers, setMemberPermissions, type TenantMember } from './catalog-remote';
import { CatalogRemoteState } from './catalog-remote-state';

/** 「管理员 / 员工」切换的两个预设 */
interface RolePreset {
  readonly label: string;
  readonly permissions: readonly string[];
}

const PRESETS: readonly RolePreset[] = [
  { label: '管理员', permissions: ADMIN_PERMISSIONS },
  { label: '员工', permissions: STAFF_PERMISSIONS }
];

/**
 * 成员与权限（US-234）：调用者是管理员的租户列出全部成员，每人一个「管理员 / 员工」切换；其余租户只显示自己的角色。
 *
 * @remarks
 * 改权限只经服务端的 `demo_set_member_permissions`：调用者要有这个租户的 manage，最后一个管理员撤不掉，失败原因原样显示。
 * 改完重读一次授权（`rxdb_caller_grants()`），本页的写入口跟着变，成员列表也随之重读；
 * 被调整的人要到下一次推拉才看得到变化。渲染在「模拟服务端变更」面板里，成员关系一节之后。
 */
@Component({
  selector: 'app-catalog-members-panel',
  template: `
    <fieldset class="fieldset gap-3" data-testid="catalog-members">
      <legend class="fieldset-legend">成员与权限</legend>
      @for (tenant of $tenants(); track tenant.tenantId) {
        <div class="flex flex-col gap-1" [attr.data-tenant-id]="tenant.tenantId" data-testid="tenant-members">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-medium"
              >{{ remote.tenantName(tenant.tenantId) }} · {{ roleLabel(tenant.permissions) }}</span
            >
            @if (tenant.manageable) {
              <button class="btn btn-ghost btn-xs" [disabled]="$busy()" (click)="reload()" type="button">
                刷新成员
              </button>
            }
          </div>
          @if (tenant.manageable) {
            <ul class="divide-base-200 divide-y">
              @for (member of membersOf(tenant.tenantId); track member.userId) {
                <li
                  class="flex flex-wrap items-center justify-between gap-2 py-1"
                  [attr.data-user-id]="member.userId"
                  data-testid="tenant-member"
                >
                  <span class="min-w-0 truncate text-sm">{{ memberName(member) }}</span>
                  <div class="join" [attr.aria-label]="memberName(member) + ' 的角色'" role="group">
                    @for (preset of presets; track preset.label) {
                      <button
                        class="btn btn-xs join-item"
                        [attr.aria-pressed]="samePermissions(member.permissions, preset.permissions)"
                        [class.btn-primary]="samePermissions(member.permissions, preset.permissions)"
                        [disabled]="$busy()"
                        (click)="setRole(tenant.tenantId, member, preset)"
                        type="button"
                      >
                        {{ preset.label }}
                      </button>
                    }
                  </div>
                </li>
              }
            </ul>
          } @else {
            <p class="label whitespace-normal">只有这个租户的管理员能调整成员权限。</p>
          }
        </div>
      } @empty {
        <p class="label whitespace-normal">还不在任何租户里：加入之后在这里看自己的角色。</p>
      }
      @if ($error(); as error) {
        <div class="alert alert-error" role="alert">{{ error }}</div>
      }
    </fieldset>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatalogMembersPanel {
  readonly #session = inject(DemoSession);
  readonly #toasts = inject(Toasts);
  readonly #members = signal<ReadonlyMap<string, readonly TenantMember[]>>(new Map());
  readonly #busy = signal(false);
  readonly #error = signal<string | null>(null);
  /** 最近一次发起的成员列表读取：交错的两次读只留后发起的那一次 */
  #generation = 0;
  readonly remote = inject(CatalogRemoteState);
  readonly presets = PRESETS;
  readonly roleLabel = roleLabel;
  readonly samePermissions = samePermissions;

  readonly $busy = this.#busy.asReadonly();
  readonly $error = this.#error.asReadonly();
  /** 所在的租户与自己的角色，标出能管理成员的 */
  readonly $tenants = computed(() => {
    const managed = this.remote.$managedTenantIds();
    return tenantGrants(this.remote.$grants()).map(grant => ({
      ...grant,
      manageable: managed.includes(grant.tenantId)
    }));
  });

  constructor() {
    // 能管理的租户变了（授权快照的内容变了，比如加入、退出租户或被升降权）：重新列出这些租户的成员
    effect(() => {
      const tenantIds = this.remote.$managedTenantIds();
      untracked(() => void this.#load(tenantIds));
    });
  }

  membersOf(tenantId: string): readonly TenantMember[] {
    return this.#members().get(tenantId) ?? [];
  }

  /** 成员在列表里的称呼：邮箱或「匿名用户」，加上 id 的前 8 位，自己标「（你）」 */
  memberName(member: TenantMember): string {
    const self = member.userId === this.#session.prepared?.identity.subject ? '（你）' : '';
    return `${member.email ?? '匿名用户'} · ${member.userId.slice(0, 8)}${self}`;
  }

  reload(): Promise<void> {
    return this.#load(this.remote.$managedTenantIds());
  }

  async setRole(tenantId: string, member: TenantMember, preset: RolePreset): Promise<void> {
    const client = this.#session.prepared?.client;
    if (!client || samePermissions(member.permissions, preset.permissions)) return;
    this.#busy.set(true);
    this.#error.set(null);
    try {
      await setMemberPermissions(client, tenantId, member.userId, preset.permissions);
      // 改的是别人的角色：自己的授权快照多半不变，能管理的租户也就不变，成员列表要自己重读
      await Promise.all([this.remote.refresh(), this.reload()]);
      this.#toasts.show({
        kind: 'success',
        message: `${this.memberName(member)} 在${this.remote.tenantName(tenantId)}改为${preset.label}。对方推送或拉取之后看到变化。`
      });
    } catch (error) {
      this.#error.set(getErrorMessage(error, '调整成员权限失败'));
    } finally {
      this.#busy.set(false);
    }
  }

  async #load(tenantIds: readonly string[]): Promise<void> {
    const client = this.#session.prepared?.client;
    if (!client) return;
    const generation = ++this.#generation;
    try {
      const lists = await Promise.all(tenantIds.map(tenantId => fetchTenantMembers(client, tenantId)));
      if (generation === this.#generation) this.#members.set(new Map(tenantIds.map((id, index) => [id, lists[index]])));
    } catch (error) {
      if (generation === this.#generation) this.#error.set(getErrorMessage(error, '读取成员列表失败'));
    }
  }
}
