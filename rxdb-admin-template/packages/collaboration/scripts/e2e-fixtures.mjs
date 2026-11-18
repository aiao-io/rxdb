import { randomUUID } from 'node:crypto';

/**
 * 三端协作 E2E 的测试夹具（两种目标共用）：建测试账号与工作区、签发验证码，结束时删掉本轮建的全部行与账号。
 * - 本机隔离栈（`browser-server.mjs`）：命令入口由测试服务自己起，夹具经它发邀请；
 * - 已部署目标（`deployed-fixtures.mjs`，ADMIN-US-217 AC#5）：命令入口与三端都是部署出来的，夹具只经部署栈的管理接口
 *   （Auth 管理接口用 service key）与初始化步骤（迁移所有者的连接）准备数据，service key 与所有者连接只在测试侧。
 * 两种目标的差别只在 `accessToken`：隔离栈按它的 HS256 共享密钥签令牌，已部署目标以真实的验证码登录取令牌（ES256）。
 */

/** 本轮建过的团队的全部行，按外键从叶到根删除（归档表也指向治理行，必须先于它删除）。 */
export const workspaceTables = [
  'public.admin_changes',
  'public.admin_audit',
  'admin_private.audit_archive',
  'public.admin_workspace_versions',
  'public.admin_shared',
  'admin_private.record_keys',
  'public.shared_records',
  'admin_private.comments',
  'admin_private.notifications',
  'admin_private.threads',
  'admin_private.reviews',
  'admin_private.candidates',
  'admin_private.prs',
  'admin_private.refs',
  'admin_private.tasks',
  'admin_private.commit_changes',
  'admin_private.commits',
  'admin_private.invitations',
  'admin_private.operations',
  'admin_private.policies',
  'admin_private.schemas',
  'admin_private.memberships',
  'admin_private.workspaces'
];

/**
 * 建一个夹具服务。
 * @param {object} options
 * @param {import('@supabase/supabase-js').SupabaseClient} options.auth service key 的 Supabase 客户端（只用 Auth 管理接口）
 * @param {{ initialize(input: object): Promise<unknown> }} options.repository 以迁移所有者连接的仓储（初始化工作区）
 * @param {string} options.commandBase 命令入口的地址（其后接 `/workspaces/:team/:app/commands`）
 * @param {unknown} options.schema 产品的数据模式清单
 * @param {string} options.supabaseUrl 浏览器使用的 Supabase 地址
 * @param {string} options.supabaseKey 公开 anon key
 * @param {(account: { id: string, email: string }) => Promise<string>} options.accessToken 取一个已登录用户的 access token
 */
export function fixtureService(options) {
  const users = [];
  const teams = [];
  /** 签出一个新的一次性验证码（同一账号的旧验证码随之作废）。 */
  async function newOtp(email) {
    const link = await options.auth.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error) throw link.error;
    return link.data.properties.email_otp;
  }
  /** 为一个测试账号签出新的验证码，供测试进程自己登录（`/__otp?email=…`）。 */
  async function otp(url) {
    const email = new URL(url, 'http://localhost').searchParams.get('email');
    return { otp: await newOtp(email) };
  }
  /**
   * 一组测试数据：三个已验证邮箱的账号（管理员、审核者、第二审核者），管理员名下的一个工作区（数据模式清单按正式初始化登记）
   * 与发给审核者的一份邀请（经命令入口发出），另有一个只有管理员的隔离团队；`?sideApp=1` 时再建同一团队下的另一个应用。
   * 验证码最后签出，保证交给测试的都还有效。
   * @param {string} url 请求路径（带查询串）
   */
  async function fixture(url) {
    const suffix = randomUUID();
    const sideApp = new URL(url, 'http://localhost').searchParams.get('sideApp') === '1';
    const accounts = [];
    for (const role of ['admin', 'reviewer', 'second']) {
      const email = `${role}-${suffix}@example.test`;
      const created = await options.auth.auth.admin.createUser({ email, email_confirm: true });
      if (created.error) throw created.error;
      users.push(created.data.user.id);
      accounts.push({ id: created.data.user.id, email, verified: true, otp: '' });
    }
    const [admin, reviewer, secondReviewer] = accounts;
    const teamId = randomUUID();
    teams.push(teamId);
    const appId = 'assets';
    const name = `团队-${suffix.slice(0, 8)}`;
    await options.repository.initialize({
      teamId,
      appId,
      name,
      bootstrapKey: randomUUID(),
      admin,
      schema: options.schema
    });
    const invitation = randomUUID();
    const token = randomUUID();
    // 邀请经命令入口发出（入口在服务端对令牌取摘要），与管理员在页面上发邀请走同一条写路径
    const invited = await fetch(`${options.commandBase}/workspaces/${teamId}/${appId}/commands`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await options.accessToken(admin)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'invite',
        id: invitation,
        email: reviewer.email,
        permissions: ['read', 'review', 'comment'],
        tokenHash: token,
        expiresAt: Date.now() + 3600000,
        expectedVersion: 0,
        operationId: randomUUID()
      })
    });
    if (!invited.ok) throw new Error(`Fixture invitation failed: ${invited.status} ${await invited.text()}`);
    const secondary = { teamId: randomUUID(), appId, name: `隔离团队-${suffix.slice(0, 8)}` };
    teams.push(secondary.teamId);
    await options.repository.initialize({ ...secondary, bootstrapKey: randomUUID(), admin, schema: options.schema });
    // 可选：同一团队下的另一个应用（RLS 矩阵的跨应用用例），只有管理员
    const side = sideApp ? { teamId, appId: 'side-app', name: `旁路应用-${suffix.slice(0, 8)}` } : undefined;
    if (side)
      await options.repository.initialize({ ...side, bootstrapKey: randomUUID(), admin, schema: options.schema });
    for (const account of accounts) account.otp = await newOtp(account.email);
    return {
      ...(side ? { sideApp: { teamId: side.teamId, appId: side.appId } } : {}),
      teamId,
      appId,
      name,
      admin,
      reviewer,
      secondReviewer,
      secondary,
      invitation,
      token,
      supabaseUrl: options.supabaseUrl,
      supabaseKey: options.supabaseKey
    };
  }
  /**
   * 夹具的 HTTP 路由：`/__fixture`、`/__otp?email=…`，以及给 Playwright 判断就绪的 `/__ready`。
   * @param {import('node:http').IncomingMessage} request
   * @param {import('node:http').ServerResponse} response
   */
  function handle(request, response) {
    if (request.url === '/__ready') {
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"ready":true}');
      return;
    }
    const route =
      request.url === '/__fixture' || request.url?.startsWith('/__fixture?') ? fixture(request.url)
      : request.url?.startsWith('/__otp?') ? otp(request.url)
      : undefined;
    if (!route) {
      response.writeHead(404).end();
      return;
    }
    void route
      .then(value => {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(value));
      })
      .catch(error => {
        console.error(error.message);
        response.writeHead(500).end('fixture error');
      });
  }
  /**
   * 删除本轮建的团队的全部行（迁移所有者连接）与这些团队频道上的 Broadcast 消息，再删测试账号。
   * @param {import('pg').Pool | undefined} owner
   */
  async function cleanup(owner) {
    if (owner && teams.length) {
      const client = await owner.connect().catch(() => undefined);
      try {
        if (client) {
          await client.query('BEGIN');
          for (const table of workspaceTables)
            await client.query(`DELETE FROM ${table} WHERE team_id = ANY($1::text[])`, [teams]);
          // Realtime 只按天分区定期清理，测试数据随团队一起删掉
          await client.query(
            "DELETE FROM realtime.messages WHERE topic LIKE 'collab:%' AND split_part(topic, ':', 2) = ANY($1::text[])",
            [teams]
          );
          await client.query('COMMIT');
        }
      } catch (error) {
        console.error(`Fixture cleanup failed: ${error.message}`);
        await client?.query('ROLLBACK').catch(() => undefined);
      } finally {
        client?.release();
      }
    }
    await Promise.allSettled(users.map(id => options.auth.auth.admin.deleteUser(id)));
  }
  return { fixture, otp, handle, cleanup, teams, users };
}
