import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { WorkspaceEntry } from './api.js';
/** 通知只携带工作区版本；业务内容仍通过重新授权的 API 读取。 */
export class WorkspaceFeed {
  private channel?: RealtimeChannel;
  private generation = 0;
  constructor(private readonly auth: SupabaseClient, private readonly changed: () => Promise<void>, private readonly status: (value: string) => void) {}
  start(workspace: WorkspaceEntry): void {
    this.stop();
    const epoch = this.generation;
    this.channel = this.auth.channel(`admin-workspace:${workspace.teamId}:${workspace.appId}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_workspace_versions', filter: `team_id=eq.${workspace.teamId}` }, payload => {
        if (epoch !== this.generation || !('app_id' in payload.new) || payload.new['app_id'] !== workspace.appId) return;
        void this.changed();
      })
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
