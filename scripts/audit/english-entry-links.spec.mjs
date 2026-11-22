import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const templates = new URL('../../.github/ISSUE_TEMPLATE/', import.meta.url);
const docs = 'https://rxdb.aiao.io/';

test('GitHub Issue 入口分别提供英文与中文文档链接', () => {
  const chooser = readFileSync(new URL('config.yml', templates), 'utf8');
  const destinations = [...chooser.matchAll(/^\s+url: (\S+)$/gm)].map(([, url]) => url);
  assert.ok(destinations.includes(`${docs}en/`), '缺少英文文档入口');
  assert.ok(destinations.includes(docs), '缺少中文文档入口');
});

test('英文提问表单的文档链接打开英文站点', () => {
  const question = readFileSync(new URL('question.yml', templates), 'utf8');
  const href = /\[documentation\]\(([^)]+)\)/i.exec(question)?.[1];
  assert.equal(href, `${docs}en/`);
});

test('英文 README 直达的官网文档都有英文源文件', () => {
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  const sources = new URL('../../website/i18n/en/docusaurus-plugin-content-docs/current/', import.meta.url);
  const links = [...readme.matchAll(/\]\((https:\/\/rxdb\.aiao\.io\/(?:en\/)?docs\/[^)#?]*)/g)];
  assert.ok(links.length > 0);
  for (const [, href] of links) {
    const route = new URL(href).pathname;
    assert.match(route, /^\/en\/docs\//);
    const slug = route.slice('/en/docs/'.length).replace(/\/$/, '');
    const candidates = slug ? [`${slug}.md`, `${slug}/README.md`] : ['README.md'];
    assert.ok(candidates.some(file => existsSync(new URL(file, sources))), `缺少 ${route} 的英文正文`);
  }
});
