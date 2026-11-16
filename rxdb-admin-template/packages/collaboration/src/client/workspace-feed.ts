import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { WorkspaceEntry } from './api.js';
export interface WorkspacePresenceChange {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  row: Record<string, unknown>;
}
/** 业务变更只携带工作区版本；Presence 通过短生命周期表增量同步。 */
export class WorkspaceFeed {
  private channel?: RealtimeChannel;
  private generation = 0;
  constructor(
    private readonly auth: SupabaseClient,
    private readonly changed: () => Promise<void>,
    private readonly status: (value: string) => void,
    private readonly presenceChanged?: (change: WorkspacePresenceChange) => void
  ) {}
  start(workspace: WorkspaceEntry): void {
    this.stop();
    const epoch = this.generation;
    this.channel = this.auth
      .channel(`admin-workspace:${workspace.teamId}:${workspace.appId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_workspace_versions', filter: `team_id=eq.${workspace.teamId}` },
        payload => {
          if (epoch !== this.generation || !('app_id' in payload.new) || payload.new['app_id'] !== workspace.appId)
            return;
          void this.changed();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_presence', filter: `team_id=eq.${workspace.teamId}` },
        payload => {
          const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
          if (epoch !== this.generation || row['app_id'] !== workspace.appId) return;
          this.presenceChanged?.({
            eventType: payload.eventType as WorkspacePresenceChange['eventType'],
            row: row as Record<string, unknown>
          });
        }
      )
      .subscribe(value => {
        if (epoch !== this.generation) return;
        this.status(value);
        if (value === 'SUBSCRIBED') void this.changed();
      });
  }
  stop(): void {
    this.generation++;
    if (this.channel) void this.auth.removeChannel(this.channel);
    this.channel = undefined;
  }
}
