import { appendFile } from 'node:fs/promises';

const marker = '<!-- rxdb-website-preview -->';

async function request({ repository, token }, suffix, { method = 'GET', body } = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token) throw new Error('缺少有效的 GitHub 仓库或 token');
  const response = await fetch(`https://api.github.com/repos/${repository}${suffix}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}: ${method} ${suffix}`);
  return response.json();
}

/** 发布和清理前读取实时 PR 状态，阻止过时提交发布及重新打开后清理。 */
export async function previewEligible(credentials, { number, state, sha }) {
  if (!/^[1-9][0-9]*$/.test(number)) throw new Error('PR 编号必须为正整数');
  if (!['open', 'closed'].includes(state)) throw new Error('PR 状态必须为 open 或 closed');
  if (state === 'open' && !/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('预览必须指定有效的 head SHA');
  const pull = await request(credentials, `/pulls/${number}`);
  return pull.state === state && (state === 'closed' || pull.head.sha === sha);
}

async function findComment(credentials, number) {
  for (let page = 1; ; page++) {
    const comments = await request(credentials, `/issues/${number}/comments?per_page=100&page=${page}`);
    const comment = comments.find(item => item.user.login === 'github-actions[bot]' && item.body?.startsWith(marker));
    if (comment) return comment;
    if (comments.length < 100) return null;
  }
}

function commentBody(credentials, { number, state, sha, aliasUrl, deploymentUrl, runId }) {
  if (!/^[1-9][0-9]*$/.test(runId)) throw new Error('无效的 Actions run ID');
  const runUrl = `https://github.com/${credentials.repository}/actions/runs/${runId}`;
  if (state === 'closed') {
    return `${marker}\n\nWebsite 旧预览已清理。PR 已关闭或合并，固定链接仅保留关闭提示页；重新打开后会重新构建并恢复预览。\n\n[清理任务](${runUrl})`;
  }
  const pagesUrl = /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pages\.dev\/?$/;
  if (!pagesUrl.test(deploymentUrl)) throw new Error('无效的 Pages 预览 URL');
  if (aliasUrl && (!pagesUrl.test(aliasUrl) || !aliasUrl.startsWith(`https://pr-${number}.`))) {
    throw new Error('无效的 Pages 预览 URL');
  }
  // wrangler 偶发不为部署绑定别名（pages-deployment-alias-url 为空）：此时固定预览仍指向
  // 上一成功部署，评论降级为只给本次部署快照链接，不让评论步骤拖垮整条 CI。
  const previewLine =
    aliasUrl ?
      `- [打开 PR #${number} 固定预览](${aliasUrl})\n- [本次部署快照](${deploymentUrl})`
    : `- [打开本次部署快照](${deploymentUrl})（固定预览本次未绑定别名，仍指向上一成功部署）`;
  return `${marker}\n\nWebsite 预览已发布。\n\n${previewLine}\n- 提交：\`${sha}\`\n- [构建与发布日志](${runUrl})\n\nPR 打开期间保留当前和上一次成功部署；关闭或合并时清理旧网站部署，仅保留一个极小的关闭提示页。`;
}

/** 幂等更新机器人自己的预览评论，避免覆盖用户评论或发布过时链接。 */
export async function updatePreviewComment(credentials, options) {
  if (!(await previewEligible(credentials, options))) return null;
  const body = commentBody(credentials, options);
  const comment = await findComment(credentials, options.number);
  const suffix = comment ? `/issues/comments/${comment.id}` : `/issues/${options.number}/comments`;
  return request(credentials, suffix, { method: comment ? 'PATCH' : 'POST', body: { body } });
}

async function main() {
  const operation = process.argv[2];
  const credentials = { repository: process.env.GITHUB_REPOSITORY, token: process.env.GH_TOKEN };
  const options = {
    number: process.env.PR_NUMBER,
    state: process.env.PR_STATE,
    sha: process.env.PR_HEAD_SHA,
    runId: process.env.GITHUB_RUN_ID,
    aliasUrl: process.env.ALIAS_URL,
    deploymentUrl: process.env.DEPLOYMENT_URL
  };
  if (operation === 'state') {
    const eligible = await previewEligible(credentials, options);
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `eligible=${eligible}\n`);
    console.log(`PR 当前状态${eligible ? '允许' : '不允许'}执行操作`);
    return;
  }
  if (operation === 'comment') {
    const comment = await updatePreviewComment(credentials, options);
    console.log(comment ? `已更新预览评论：${comment.html_url}` : 'PR 状态已变化，跳过评论');
    return;
  }
  throw new Error(`未知操作：${operation}`);
}

if (import.meta.main) {
  await main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
