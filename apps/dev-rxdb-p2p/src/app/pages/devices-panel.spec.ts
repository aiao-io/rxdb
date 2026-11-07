import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignalingPeer } from '../../../shared/signaling-protocol';
import { P2PWorkspace } from '../p2p/p2p-workspace.service';
import type { LinkView } from '../p2p/peer-links';
import type { SignalingState } from '../p2p/signaling-client';
import { DevicesPanel } from './devices-panel';

const peer: SignalingPeer = {
  key: 'other-browser',
  principal: 'user',
  userName: 'user@example.com',
  deviceId: 'device',
  deviceName: '客厅电脑'
};
const link = (state: LinkView['state']): LinkView => ({
  connectionId: `connection-${state}`,
  peer,
  role: 'initiator',
  state,
  closeCode: state === 'closed' ? 'peer_closed' : null,
  protocols: ['files'],
  frames: [],
  totals: { sent: 0, received: 0, bytesSent: 0, bytesReceived: 0 }
});

describe('设备连接交互', () => {
  const workspace = {
    peers: signal<readonly SignalingPeer[]>([]),
    reachable: signal<readonly SignalingPeer[]>([]),
    links: signal<readonly LinkView[]>([]),
    signalingState: signal<SignalingState>('online'),
    connect: vi.fn<(key: string) => Promise<void>>(),
    disconnect: vi.fn<(id: string) => void>()
  };

  beforeEach(async () => {
    workspace.peers.set([peer]);
    workspace.reachable.set([peer]);
    workspace.links.set([]);
    workspace.signalingState.set('online');
    workspace.connect.mockReset().mockResolvedValue();
    workspace.disconnect.mockReset();
    await TestBed.configureTestingModule({
      imports: [DevicesPanel],
      providers: [{ provide: P2PWorkspace, useValue: workspace }]
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('断开后保留重新连接入口，连接失败向用户显示原因', async () => {
    workspace.links.set([link('closed')]);
    workspace.connect.mockRejectedValue(new Error('另一台设备暂时无法连接'));
    const fixture = TestBed.createComponent(DevicesPanel);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector<HTMLButtonElement>('[data-testid="peer-connect"]');
    expect(button?.textContent).toContain('重新连接');
    button?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(workspace.connect).toHaveBeenCalledWith(peer.key);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('另一台设备暂时无法连接');
    expect(button?.disabled).toBe(false);
  });

  it('信令掉线仍能断开已建立的连接', () => {
    workspace.peers.set([]);
    workspace.signalingState.set('offline');
    workspace.links.set([link('ready')]);
    const fixture = TestBed.createComponent(DevicesPanel);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('信令不可达');
    const row = root.querySelector('[data-testid="peer-row"]');
    expect(row?.textContent).toContain('客厅电脑');
    const button = row?.querySelector<HTMLButtonElement>('button');
    expect(button?.textContent).toContain('断开');
    button?.click();
    expect(workspace.disconnect).toHaveBeenCalledWith('connection-ready');
  });

  it('凭据被拒或被管理员移出时说明原因与下一步，不再说等服务恢复', () => {
    workspace.peers.set([]);
    workspace.signalingState.set('rejected');
    const fixture = TestBed.createComponent(DevicesPanel);
    fixture.detectChanges();
    const notice = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="signaling-rejected"]');
    expect(notice?.textContent).toContain('信令拒绝了本机凭据');
    expect(notice?.textContent).toContain('被管理员移出');
    expect(notice?.textContent).toContain('联系管理员');
    expect(notice?.textContent).not.toContain('等服务恢复');
  });

  it('空状态说明第二台设备的操作，技术会话默认折叠', () => {
    workspace.peers.set([]);
    workspace.reachable.set([]);
    const fixture = TestBed.createComponent(DevicesPanel);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('同一局域网');
    expect(root.textContent).toContain('下载时会自动连接');
    expect(root.querySelector('details')?.open).toBe(false);
  });
});
