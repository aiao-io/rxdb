import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceFeed } from './workspace-feed.js';
function setup() {
  const channels: { change: (value: { new: Record<string, unknown> }) => void; status: (value: string) => void }[] = [];
  const auth = {
    channel: vi.fn(() => {
      const callbacks: { change: (value: { new: Record<string, unknown> }) => void; status: (value: string) => void } =
        { change: vi.fn(), status: vi.fn() };
      channels.push(callbacks);
      const channel = {
        on: vi.fn((_event: string, _filter: unknown, callback: typeof callbacks.change) => {
          callbacks.change = callback;
          return channel;
        }),
        subscribe: vi.fn((callback: typeof callbacks.status) => {
          callbacks.status = callback;
          return channel;
        })
      };
      return channel;
    }),
    removeChannel: vi.fn().mockResolvedValue('ok')
  };
  const changed = vi.fn().mockResolvedValue(undefined);
  const status = vi.fn();
  return {
    channels,
    auth,
    changed,
    status,
    feed: new WorkspaceFeed(auth as unknown as SupabaseClient, changed, status)
  };
}
describe('authorized workspace invalidation subscription', () => {
  it('refreshes on reconnect and matching application versions without accepting another context', () => {
    const { channels, auth, changed, status, feed } = setup();
    feed.start({ teamId: 'team', appId: 'assets', name: 'Team' });
    const channel = auth.channel.mock.results[0].value;
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'admin_workspace_versions', filter: 'team_id=eq.team' }),
      expect.any(Function)
    );
    channels[0].change({ new: { app_id: 'other' } });
    expect(changed).not.toHaveBeenCalled();
    channels[0].status('SUBSCRIBED');
    channels[0].change({ new: { app_id: 'assets', revision: 2 } });
    expect(changed).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenCalledWith('SUBSCRIBED');
    feed.stop();
    channels[0].change({ new: { app_id: 'assets' } });
    channels[0].status('CHANNEL_ERROR');
    expect(changed).toHaveBeenCalledTimes(2);
    expect(status).not.toHaveBeenCalledWith('CHANNEL_ERROR');
    expect(auth.removeChannel).toHaveBeenCalledTimes(1);
  });
  it('removes the old subscription on a team switch and reports live connection failure', () => {
    const { channels, changed, status, feed } = setup();
    feed.start({ teamId: 'team', appId: 'assets', name: 'Team' });
    feed.start({ teamId: 'other', appId: 'assets', name: 'Other' });
    channels[0].change({ new: { app_id: 'assets' } });
    expect(changed).not.toHaveBeenCalled();
    channels[1].status('TIMED_OUT');
    expect(status).toHaveBeenCalledWith('TIMED_OUT');
    channels[1].change({ new: { app_id: 'assets' } });
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
