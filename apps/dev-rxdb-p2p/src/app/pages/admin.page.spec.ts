import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AdminAccount,
  AdminAccountPage,
  AdminOnlineDevice,
  AdminServerFile,
  AdminServerFiles
} from '../../../shared/admin-protocol';
import { AdminApi } from '../admin/admin-api';
import { AuthService } from '../auth/auth.service';
import AdminPage from './admin.page';

const ROOT = '9a1d3c52-7b0e-4d0f-8f4a-5b2c1e0d9f01';
const ALICE = '6f1c5d1e-4c7b-4f7e-9a51-2d0c3b8f9a10';
const BOB = '0b9d8c7a-6e5f-4a3b-8c2d-1e0f9a8b7c6d';
const DEVICE = 'd4c3b2a1-0f9e-4d8c-b7a6-5f4e3d2c1b0a';
const HASH = 'a'.repeat(64);

const account = (id: string, email: string, overrides: Partial<AdminAccount> = {}): AdminAccount => ({
  id,
  email,
  createdAt: '2026-11-01T08:00:00Z',
  lastSignInAt: '2026-11-04T08:00:00Z',
  banned: false,
  admin: false,
  deviceCount: 1,
  claimCount: 2,
  ...overrides
});

const ROOT_ACCOUNT = account(ROOT, 'root@example.com', { admin: true, deviceCount: 0, claimCount: 0 });
const ALICE_ACCOUNT = account(ALICE, 'alice@example.com');
const BOB_ACCOUNT = account(BOB, 'bob@example.com', { banned: true, lastSignInAt: null });
const ONLINE: AdminOnlineDevice = {
  deviceId: DEVICE,
  deviceName: '客厅电脑',
  userId: ALICE,
  userName: 'alice@example.com',
  instanceKey: 'instance-1234567890'
};
const COPY: AdminServerFile = {
  contentHash: HASH,
  fileName: '报告.pdf',
  size: 2048,
  uploadedAt: '2026-11-04T08:00:00Z',
  holderCount: 2
};

const page = (accounts: readonly AdminAccount[], total = accounts.length, current = 1): AdminAccountPage => ({
  accounts,
  total,
  page: current
});

const findButton = (root: HTMLElement, selector: string): HTMLButtonElement => {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`找不到按钮：${selector}`);
  return button;
};

describe('AdminPage', () => {
  const api = {
    accounts: vi.fn<(page: number) => Promise<AdminAccountPage>>(),
    online: vi.fn<() => Promise<readonly AdminOnlineDevice[]>>(),
    files: vi.fn<() => Promise<AdminServerFiles>>(),
    ban: vi.fn<(id: string) => Promise<{ evictedDevices: number }>>(),
    unban: vi.fn<(id: string) => Promise<void>>(),
    deleteAccount: vi.fn<(id: string) => Promise<{ purgedClaims: number; evictedDevices: number }>>(),
    kick: vi.fn<(id: string) => Promise<{ evictedDevices: number }>>(),
    deleteFile: vi.fn<(hash: string) => Promise<void>>()
  };
  const auth = {
    session: signal({ user: { id: ROOT, email: 'root@example.com' } }),
    signOut: vi.fn(async () => undefined)
  };
  let fixture: ComponentFixture<AdminPage>;
  let root: HTMLElement;
  let admin: AdminPage;

  const settle = async (): Promise<void> => {
    await vi.waitFor(() => expect(admin.loading() || admin.busy()).toBe(false));
    fixture.detectChanges();
  };

  const open = async (): Promise<void> => {
    fixture = TestBed.createComponent(AdminPage);
    root = fixture.nativeElement as HTMLElement;
    admin = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
  };

  const rows = (testId: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)];

  beforeEach(() => {
    vi.resetAllMocks();
    api.accounts.mockResolvedValue(page([ROOT_ACCOUNT, ALICE_ACCOUNT, BOB_ACCOUNT]));
    api.online.mockResolvedValue([ONLINE]);
    api.files.mockResolvedValue({ files: [COPY], totalBytes: 2048, truncated: false });
    api.ban.mockResolvedValue({ evictedDevices: 1 });
    api.unban.mockResolvedValue(undefined);
    api.deleteAccount.mockResolvedValue({ purgedClaims: 4, evictedDevices: 1 });
    api.kick.mockResolvedValue({ evictedDevices: 1 });
    api.deleteFile.mockResolvedValue(undefined);
    auth.signOut.mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminApi, useValue: api },
        { provide: AuthService, useValue: auth }
      ]
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  describe('overview', () => {
    it('loads accounts, online devices and server copies when opened', async () => {
      await open();

      expect(api.accounts).toHaveBeenCalledWith(1);
      expect(rows('admin-account-row').map(row => row.dataset['email'])).toEqual([
        'root@example.com',
        'alice@example.com',
        'bob@example.com'
      ]);
      const summary = root.querySelector('[data-testid="admin-summary"]')?.textContent ?? '';
      expect(summary).toContain('3');
      expect(summary).toContain('1');
      expect(summary).toContain('2 KB');
    });

    it('shows each section that loaded and names the one that did not', async () => {
      api.files.mockRejectedValue(new Error('R2 is unreachable'));

      await open();

      expect(rows('admin-account-row')).toHaveLength(3);
      const message = root.querySelector('[data-testid="admin-load-error"]')?.textContent ?? '';
      expect(message).toContain('服务器副本');
      expect(message).toContain('R2 is unreachable');
      expect(message).not.toContain('账号列表');
    });

    it('marks administrators and gives them no actions, while others get ban and delete', async () => {
      await open();

      const [self, alice, bob] = rows('admin-account-row');
      expect(self?.textContent).toContain('你');
      expect(self?.querySelector('button')).toBeNull();
      expect(alice?.querySelector('[data-testid="admin-ban"]')).not.toBeNull();
      expect(alice?.querySelector('[data-testid="admin-delete-account"]')).not.toBeNull();
      expect(bob?.querySelector('[data-testid="admin-banned"]')).not.toBeNull();
      expect(bob?.querySelector('[data-testid="admin-unban"]')).not.toBeNull();
      expect(bob?.querySelector('[data-testid="admin-ban"]')).toBeNull();
    });

    it('tells another administrator apart from the signed-in one', async () => {
      api.accounts.mockResolvedValue(page([account(BOB, 'second@example.com', { admin: true })]));

      await open();

      const row = rows('admin-account-row')[0];
      expect(row?.textContent).toContain('管理员');
      expect(row?.textContent).not.toContain('你');
      expect(row?.querySelector('button')).toBeNull();
    });

    it('switches between accounts, online devices and server copies', async () => {
      await open();
      const tab = (name: string) => findButton(root, `[data-testid="admin-tab-${name}"]`);

      expect(tab('accounts').getAttribute('aria-selected')).toBe('true');
      tab('online').click();
      fixture.detectChanges();
      expect(tab('online').getAttribute('aria-selected')).toBe('true');
      expect(rows('admin-account-row')).toHaveLength(0);
      expect(rows('admin-device-row')[0]?.textContent).toContain('客厅电脑');
      expect(rows('admin-device-row')[0]?.textContent).toContain('alice@example.com');

      tab('files').click();
      fixture.detectChanges();
      const copy = rows('admin-file-row')[0];
      expect(copy?.textContent).toContain('报告.pdf');
      expect(copy?.textContent).toContain(HASH.slice(0, 12));
      expect(copy?.textContent).toContain('2 KB');
    });

    it('says when a copy is no longer in the manifest and when the listing was cut off', async () => {
      api.files.mockResolvedValue({ files: [{ ...COPY, fileName: null, holderCount: 0 }], totalBytes: 2048, truncated: true });
      await open();

      admin.selectTab('files');
      fixture.detectChanges();

      const text = root.textContent ?? '';
      expect(text).toContain('清单里已没有');
      expect(text).toContain('只列出了前');
    });
  });

  describe('paging', () => {
    it('pages through the accounts and keeps the page on refresh', async () => {
      api.accounts.mockImplementation(async number => page([ALICE_ACCOUNT], 120, number));
      await open();
      expect(admin.pageCount()).toBe(3);
      expect(root.querySelector('[data-testid="admin-pagination"]')?.textContent).toContain('第 1 / 3 页');

      await admin.goToPage(2);
      fixture.detectChanges();
      expect(api.accounts).toHaveBeenLastCalledWith(2);
      expect(root.querySelector('[data-testid="admin-pagination"]')?.textContent).toContain('第 2 / 3 页');

      await admin.refresh();
      expect(api.accounts).toHaveBeenLastCalledWith(2);
    });

    it('ignores a page outside the range', async () => {
      api.accounts.mockImplementation(async number => page([ALICE_ACCOUNT], 120, number));
      await open();
      api.accounts.mockClear();

      await admin.goToPage(0);
      await admin.goToPage(4);

      expect(api.accounts).not.toHaveBeenCalled();
    });

    it('steps back to the last page when the current one has emptied out', async () => {
      api.accounts.mockImplementation(async number =>
        number === 2 ? page([], 50, 2) : page([ALICE_ACCOUNT], number === 1 ? 120 : 50, number)
      );
      await open();

      await admin.goToPage(2);

      expect(api.accounts).toHaveBeenLastCalledWith(1);
      expect(admin.accountPage()?.page).toBe(1);
    });

    it('hides the pager when everything fits on one page', async () => {
      await open();

      expect(root.querySelector('[data-testid="admin-pagination"]')).toBeNull();
    });
  });

  describe('actions', () => {
    const confirmBar = () => root.querySelector('[data-testid="admin-confirm"]');

    it('asks before banning, then bans, reports the result and reloads', async () => {
      await open();

      findButton(rows('admin-account-row')[1] as HTMLElement, '[data-testid="admin-ban"]').click();
      fixture.detectChanges();
      expect(api.ban).not.toHaveBeenCalled();
      expect(confirmBar()?.textContent).toContain('alice@example.com');
      expect(confirmBar()?.textContent).toContain('断开');

      findButton(root, '[data-testid="admin-confirm-submit"]').click();
      await settle();

      expect(api.ban).toHaveBeenCalledExactlyOnceWith(ALICE);
      expect(root.querySelector('[data-testid="admin-notice"]')?.textContent).toContain('已封禁 alice@example.com');
      expect(root.querySelector('[data-testid="admin-notice"]')?.textContent).toContain('1 个在线连接');
      expect(confirmBar()).toBeNull();
      expect(api.accounts).toHaveBeenCalledTimes(2);
    });

    it('lifts a ban at once without asking', async () => {
      await open();

      findButton(rows('admin-account-row')[2] as HTMLElement, '[data-testid="admin-unban"]').click();
      await settle();

      expect(api.unban).toHaveBeenCalledExactlyOnceWith(BOB);
      expect(confirmBar()).toBeNull();
      expect(root.querySelector('[data-testid="admin-notice"]')?.textContent).toContain('已解封 bob@example.com');
    });

    it('spells out what deleting an account removes before doing it', async () => {
      await open();

      findButton(rows('admin-account-row')[1] as HTMLElement, '[data-testid="admin-delete-account"]').click();
      fixture.detectChanges();
      const text = confirmBar()?.textContent ?? '';
      expect(text).toContain('alice@example.com');
      expect(text).toContain('设备登记');
      expect(text).toContain('持有声明');
      expect(text).toContain('不可撤销');
      expect(api.deleteAccount).not.toHaveBeenCalled();

      findButton(root, '[data-testid="admin-confirm-submit"]').click();
      await settle();

      expect(api.deleteAccount).toHaveBeenCalledExactlyOnceWith(ALICE);
      const notice = root.querySelector('[data-testid="admin-notice"]')?.textContent ?? '';
      expect(notice).toContain('已删除 alice@example.com');
      expect(notice).toContain('4 条持有声明');
    });

    it('kicks a device offline and says that the page must be reloaded to reconnect', async () => {
      await open();
      admin.selectTab('online');
      fixture.detectChanges();

      findButton(rows('admin-device-row')[0] as HTMLElement, '[data-testid="admin-kick"]').click();
      fixture.detectChanges();
      expect(confirmBar()?.textContent).toContain('客厅电脑');
      expect(confirmBar()?.textContent).toContain('刷新');

      findButton(root, '[data-testid="admin-confirm-submit"]').click();
      await settle();

      expect(api.kick).toHaveBeenCalledExactlyOnceWith(DEVICE);
      expect(root.querySelector('[data-testid="admin-notice"]')?.textContent).toContain('客厅电脑');
    });

    it('deletes a server copy after confirmation and names the file', async () => {
      await open();
      admin.selectTab('files');
      fixture.detectChanges();

      findButton(rows('admin-file-row')[0] as HTMLElement, '[data-testid="admin-delete-file"]').click();
      fixture.detectChanges();
      expect(confirmBar()?.textContent).toContain('报告.pdf');

      findButton(root, '[data-testid="admin-confirm-submit"]').click();
      await settle();

      expect(api.deleteFile).toHaveBeenCalledExactlyOnceWith(HASH);
      expect(root.querySelector('[data-testid="admin-notice"]')?.textContent).toContain('报告.pdf');
    });

    it('names a copy by its hash when the manifest no longer knows the file', async () => {
      await open();

      admin.ask({ kind: 'delete-file', file: { ...COPY, fileName: null } });
      fixture.detectChanges();

      expect(confirmBar()?.textContent).toContain(HASH.slice(0, 12));
    });

    it('leaves everything alone when the confirmation is cancelled', async () => {
      await open();
      admin.ask({ kind: 'delete-account', account: ALICE_ACCOUNT });
      fixture.detectChanges();

      findButton(root, '[data-testid="admin-confirm-cancel"]').click();
      fixture.detectChanges();

      expect(confirmBar()).toBeNull();
      expect(api.deleteAccount).not.toHaveBeenCalled();
    });

    it('reports a failed action, closes the confirmation and still reloads the lists', async () => {
      api.ban.mockRejectedValue(new Error('signaling room responded 500'));
      await open();
      admin.ask({ kind: 'ban', account: ALICE_ACCOUNT });

      await admin.confirm();
      fixture.detectChanges();

      expect(root.querySelector('[data-testid="admin-error"]')?.textContent).toContain('signaling room responded 500');
      expect(root.querySelector('[data-testid="admin-notice"]')).toBeNull();
      expect(confirmBar()).toBeNull();
      expect(api.accounts).toHaveBeenCalledTimes(2);
    });

    it('does nothing without a pending action and ignores a second confirm while one is running', async () => {
      await open();
      await admin.confirm();
      expect(api.ban).not.toHaveBeenCalled();

      let release: () => void = () => undefined;
      api.ban.mockReturnValueOnce(new Promise(resolve => (release = () => resolve({ evictedDevices: 0 }))));
      admin.ask({ kind: 'ban', account: ALICE_ACCOUNT });
      const first = admin.confirm();
      await admin.confirm();
      release();
      await first;

      expect(api.ban).toHaveBeenCalledOnce();
    });
  });

  describe('session', () => {
    it('links back to file sharing and shows who is signed in', async () => {
      await open();

      expect(root.querySelector('a[href="/"]')?.textContent).toContain('返回文件共享');
      expect(root.querySelector('[data-testid="admin-user"]')?.textContent).toContain('root@example.com');
    });

    it('signs out, and shows a failure so the user can retry', async () => {
      await open();
      auth.signOut.mockRejectedValueOnce(new Error('退出失败，请重试'));

      await admin.signOut();
      fixture.detectChanges();

      expect(root.querySelector('[data-testid="admin-error"]')?.textContent).toContain('退出失败，请重试');
      expect(admin.signingOut()).toBe(false);
      await admin.signOut();
      expect(auth.signOut).toHaveBeenCalledTimes(2);
    });
  });
});
