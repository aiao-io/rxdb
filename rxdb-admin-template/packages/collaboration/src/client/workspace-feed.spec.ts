import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceFeed } from './workspace-feed.js';
function setup() {
  const channels: {
    change: (value: { new: Record<string, unknown> }) => void;
    presence: (value: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown>; old: Record<string, unknown> }) => void;
    status: (value: string) => void;
  }[] = [];
  const auth = {
    channel: vi.fn(() => {
      const callbacks = {
        change: vi.fn() as (value: { new: Record<string, unknown> }) => void,
        presence: vi.fn() as (value: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown>; old: Record<string, unknown> }) => void,
        status: vi.fn() as (value: string) => void
      };
      channels.push(callbacks);
      const channel = {
        on: vi.fn((_event: string, filter: { table: string }, callback: typeof callbacks.change) => {
          if (filter.table === 'admin_presence') callbacks.presence = callback as typeof callbacks.presence;
          else callbacks.change = callback as typeof callbacks.change;
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
  const presenceChanged = vi.fn();
  return {
    channels,
    auth,
    changed,
    status,
    presenceChanged,
    feed: new WorkspaceFeed(auth as unknown as SupabaseClient, changed, status, presenceChanged)
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
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'admin_presence', filter: 'team_id=eq.team' }),
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
  it('delivers matching presence changes without triggering a workspace snapshot refresh', () => {
    const { channels, changed, presenceChanged, feed } = setup();
    feed.start({ teamId: 'team', appId: 'assets', name: 'Team' });
    channels[0].presence({
      eventType: 'INSERT',
      new: { app_id: 'other', user_id: 'alice' },
      old: {}
    });
    expect(presenceChanged).not.toHaveBeenCalled();
    channels[0].presence({
      eventType: 'UPDATE',
      new: { app_id: 'assets', user_id: 'alice', session_id: 'browser', expires_at: 1 },
      old: {}
    });
    expect(presenceChanged).toHaveBeenCalledWith({
      eventType: 'UPDATE',
      row: { app_id: 'assets', user_id: 'alice', session_id: 'browser', expires_at: 1 }
    });
    expect(changed).not.toHaveBeenCalled();
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
