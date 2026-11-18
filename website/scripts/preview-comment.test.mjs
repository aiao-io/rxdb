import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewEligible, updatePreviewComment } from './preview-comment.mjs';

const credentials = { repository: 'aiao-io/rxdb', token: 'test-token' };
const sha = 'a'.repeat(40);
const published = {
  number: '224',
  sha,
  state: 'open',
  aliasUrl: 'https://pr-224.rxdb.pages.dev',
  deploymentUrl: 'https://abc123.rxdb.pages.dev',
  runId: '123'
};
const pull = { state: 'open', head: { sha } };
const marker = '<!-- rxdb-website-preview -->';

function apiMock(t, replies) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const { endpoint, result, status = 200 } = replies.shift();
    assert.equal(url, `https://api.github.com/repos/aiao-io/rxdb${endpoint}`);
    calls.push({ ...options, body: options.body && JSON.parse(options.body) });
    return Response.json(result, { status });
  });
  return calls;
}

test('首次部署创建含固定地址、快照、提交与日志的评论', async t => {
  const calls = apiMock(t, [
    { endpoint: '/pulls/224', result: pull },
    { endpoint: '/issues/224/comments?per_page=100&page=1', result: [] },
    { endpoint: '/issues/224/comments', result: { html_url: 'https://github.com/comment' } }
  ]);
  await updatePreviewComment(credentials, published);
  assert.equal(calls[2].method, 'POST');
  for (const value of [marker, published.aliasUrl, published.deploymentUrl, sha, '/actions/runs/123']) {
    assert.ok(calls[2].body.body.includes(value));
  }
});

test('分页找到机器人评论后原地更新，忽略用户伪造的标记', async t => {
  const humanComments = Array.from({ length: 100 }, (_, id) => ({ id, body: marker, user: { login: 'contributor' } }));
  const calls = apiMock(t, [
    { endpoint: '/pulls/224', result: pull },
    { endpoint: '/issues/224/comments?per_page=100&page=1', result: humanComments },
    {
      endpoint: '/issues/224/comments?per_page=100&page=2',
      result: [{ id: 101, body: marker, user: { login: 'github-actions[bot]' } }]
    },
    { endpoint: '/issues/comments/101', result: { html_url: 'https://github.com/comment' } }
  ]);
  await updatePreviewComment(credentials, published);
  assert.equal(calls[3].method, 'PATCH');
});

test('PR 关闭或 head 更新后不发布过时的预览评论', async t => {
  for (const result of [
    { ...pull, state: 'closed' },
    { ...pull, head: { sha: 'b'.repeat(40) } }
  ]) {
    const calls = apiMock(t, [{ endpoint: '/pulls/224', result }]);
    assert.equal(await updatePreviewComment(credentials, published), null);
    assert.equal(calls.length, 1);
    t.mock.restoreAll();
  }
});

test('清理前重新检查状态，重新打开的 PR 不允许删除', async t => {
  apiMock(t, [{ endpoint: '/pulls/224', result: pull }]);
  assert.equal(await previewEligible(credentials, { number: '224', state: 'closed' }), false);
});

test('关闭后把同一条评论改为已清理', async t => {
  const calls = apiMock(t, [
    { endpoint: '/pulls/224', result: { ...pull, state: 'closed' } },
    {
      endpoint: '/issues/224/comments?per_page=100&page=1',
      result: [{ id: 101, body: marker, user: { login: 'github-actions[bot]' } }]
    },
    { endpoint: '/issues/comments/101', result: { html_url: 'https://github.com/comment' } }
  ]);
  await updatePreviewComment(credentials, { number: '224', state: 'closed', runId: '123' });
  assert.match(calls[2].body.body, /已清理/);
  assert.ok(!calls[2].body.body.includes(published.deploymentUrl));
});

test('无效的 PR 编号和 SHA 不发送评论', async () => {
  await assert.rejects(previewEligible(credentials, { number: '../main', state: 'closed' }), /PR 编号/);
  await assert.rejects(previewEligible(credentials, { number: '224', state: 'open' }), /SHA/);
});

test('GitHub 拒绝写评论时报告失败', async t => {
  apiMock(t, [
    { endpoint: '/pulls/224', result: pull },
    { endpoint: '/issues/224/comments?per_page=100&page=1', result: [] },
    { endpoint: '/issues/224/comments', result: {}, status: 403 }
  ]);
  await assert.rejects(updatePreviewComment(credentials, published), /GitHub HTTP 403/);
});

test('预览 URL 包含外站或 Markdown 注入时不发送评论', async t => {
  for (const aliasUrl of [
    'https://evil.example',
    'https://pr-224.rxdb.pages.dev/](https://evil.example)',
    'https://pr-225.rxdb.pages.dev'
  ]) {
    const calls = apiMock(t, [{ endpoint: '/pulls/224', result: pull }]);
    await assert.rejects(updatePreviewComment(credentials, { ...published, aliasUrl }), /无效的 Pages 预览 URL/);
    assert.equal(calls.length, 1);
    t.mock.restoreAll();
  }
});
