import type { Pool } from 'pg';
import { demand, type AuditQuery, type HistoryQuery, type Identity, type Task } from '../model.js';
import { readPageSize } from '../read-source.js';
import { CollaborationReader, type WorkspaceEntry } from '../reader.js';
import { taskOf, type TaskRow } from '../rows.js';
import { pgReadSource } from './pg-read.js';
import type { ReferenceSummary } from './reference.testing.js';

/**
 * 集成测试里的读取路径：与浏览器同一个 {@link CollaborationReader}，经 {@link pgReadSource} 以 authenticated 角色读
 * public 下的只读投影与读取函数，可见范围只由投影的成员资格条件裁决。方法形状沿用改造前仓储的读接口，
 * 用例因此只换调用对象；`read` 把团队页、全部 PR 的详情、本人的全部通知与最近一窗审计拼成一份整页视图，供断言使用
 * （浏览器只按需读其中的一部分）。
 */
export function pgReads(pool: Pool) {
  const reader = (user: Identity) => new CollaborationReader(() => pgReadSource(pool, user.id));
  const entry = (teamId: string, appId: string): WorkspaceEntry => ({ teamId, appId, name: teamId });
  /** 工作区的全部任务（团队页只带本人的与 PR 用到的，断言要看全部）。 */
  const allTasks = async (user: Identity, teamId: string, appId: string): Promise<Task[]> => {
    const rows = await pgReadSource(pool, user.id).rows<TaskRow>('admin_tasks', {
      columns: ['id', 'name', 'owner_id', 'base', 'origin_task_id', 'head'],
      where: { team_id: { eq: teamId }, app_id: { eq: appId } },
      order: [['seq', 'asc']],
      limit: readPageSize
    });
    return rows.map(taskOf);
  };
  const reads = {
    reader,
    /** 当前账号可访问的团队与应用。 */
    list: (user: Identity) => reader(user).workspaces(),
    /** 整页视图：形状与改造前的工作区摘要相同。 */
    async read(user: Identity, teamId: string, appId: string): Promise<ReferenceSummary> {
      const workspace = entry(teamId, appId);
      const team = await reader(user).team(workspace, user.id, {
        prs: readPageSize,
        tasks: readPageSize,
        notices: readPageSize,
        taskIds: []
      });
      const details = await Promise.all(team.prs.map(pr => reader(user).prDetail(workspace, pr, team)));
      const notices = team.notices;
      return {
        teamId: team.teamId,
        appId: team.appId,
        name: team.name,
        revision: team.revision,
        schemaVersion: team.schemaVersion,
        head: team.head,
        root: team.root,
        policy: team.policy,
        members: team.members,
        tasks: await allTasks(user, teamId, appId),
        prs: team.prs,
        candidates: Object.assign({}, ...details.map(detail => detail.candidates)),
        reviews: details.flatMap(detail => detail.reviews),
        threads: details.flatMap(detail => detail.threads),
        notifications: notices.notices,
        invitations: team.invitations,
        audit: await reader(user).recentAudit(workspace),
        auditCount: team.auditCount,
        governance: details.map(detail => detail.governance)
      };
    },
    async readRecords(user: Identity, teamId: string, appId: string) {
      const { head } = await reader(user).version(entry(teamId, appId));
      return reader(user).records(entry(teamId, appId), head);
    },
    async readCommit(user: Identity, teamId: string, appId: string, id: string) {
      const { head, root } = await reads.branch(user, teamId, appId);
      return reader(user).commit(entry(teamId, appId), { head, root }, id);
    },
    async readCandidate(user: Identity, teamId: string, appId: string, id: string) {
      const { head, root } = await reads.branch(user, teamId, appId);
      return reader(user).candidate(entry(teamId, appId), { head, root }, id);
    },
    /** 共享分支的头与根（团队页里的工作区行）。 */
    async branch(user: Identity, teamId: string, appId: string) {
      const team = await reader(user).team(entry(teamId, appId), user.id, {
        prs: 1,
        tasks: 1,
        notices: 1,
        taskIds: []
      });
      return { head: team.head, root: team.root };
    },
    /** 下发接口：客户端已知的提交之后到分支头的交换记录（与浏览器同一个读取函数）。 */
    exchange: (
      user: Identity,
      teamId: string,
      appId: string,
      branch: Parameters<CollaborationReader['exchange']>[1],
      known: readonly string[],
      limit?: number
    ) => reader(user).exchange(entry(teamId, appId), branch, known, limit),
    /** 提交历史的一页：分支范围按查询取共享头、任务或 PR 来源任务的头与共同起点，与改造前的服务端规则一致。 */
    async readHistory(user: Identity, teamId: string, appId: string, query: HistoryQuery) {
      const view = await reads.read(user, teamId, appId);
      const selectors = [query.branch, query.taskId, query.prId].filter(value => value !== undefined);
      demand(selectors.length === 1, 'invalid', '请求字段不合法');
      const taskId = query.taskId ?? view.prs.find(pr => pr.id === query.prId)?.taskId;
      const task = view.tasks.find(item => item.id === taskId);
      demand(query.branch !== undefined || task, 'not_found', '任务不存在');
      const range =
        query.branch !== undefined ? { head: view.head, until: view.root } : { head: task!.head, until: task!.base };
      return reader(user).history(entry(teamId, appId), range, { before: query.before, limit: query.limit });
    },
    readSchema: (user: Identity, teamId: string, appId: string, version: number) =>
      reader(user).schema(entry(teamId, appId), version),
    readAudit: (user: Identity, teamId: string, appId: string, query: AuditQuery) =>
      reader(user).audit(entry(teamId, appId), query),
    receipt: (user: Identity, teamId: string, appId: string, operationId: string) =>
      reader(user).receipt(entry(teamId, appId), operationId)
  };
  return reads;
}
