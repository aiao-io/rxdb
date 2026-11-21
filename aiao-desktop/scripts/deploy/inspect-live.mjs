import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setDefaultResultOrder } from 'node:dns';
import { writeFileSync } from 'node:fs';
import { platform, release } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { deployConfig } from './config.mjs';

/** 只读核对线上入口，不跟随重定向；内容摘要和响应头均保留供复核。 */
export async function inspectEntrypoints({ targets, requiredHeaders, fetchImpl = fetch }) {
  const entries = await Promise.all(
    targets.map(async url => {
      try {
        const response = await fetchImpl(url, {
          redirect: 'manual',
          cache: 'no-store',
          signal: AbortSignal.timeout(30_000)
        });
        const body = Buffer.from(await response.arrayBuffer());
        const headers = Object.fromEntries(
          Object.keys(requiredHeaders).map(name => [name, response.headers.get(name)])
        );
        const problems = Object.entries(requiredHeaders)
          .filter(([name, expected]) => headers[name] !== expected)
          .map(([name, expected]) => `${name}: ${headers[name]}，期望 ${expected}`);
        if (response.status !== 200) problems.unshift(`HTTP ${response.status}，期望 200`);
        return {
          url,
          status: response.status,
          location: response.headers.get('location'),
          headers,
          bytes: body.length,
          sha256: createHash('sha256').update(body).digest('hex'),
          problems
        };
      } catch (error) {
        return { url, problems: [String(error)] };
      }
    })
  );
  const sameEntrypoint = entries.every(entry => entry.sha256 && entry.sha256 === entries[0].sha256);
  return { entries, sameEntrypoint, passed: sameEntrypoint && entries.every(entry => entry.problems.length === 0) };
}

async function main() {
  const { values } = parseArgs({ options: { output: { type: 'string' } }, strict: true });
  setDefaultResultOrder('ipv6first');
  const result = await inspectEntrypoints({
    targets: [`https://${deployConfig.projectName}.pages.dev/`, 'https://desktop.aiao.io/'],
    requiredHeaders: deployConfig.requiredHeaders
  });
  const report = {
    format: 'aiao-desktop.inspect-live',
    version: 1,
    measuredAt: new Date().toISOString(),
    source: {
      sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      changes: execFileSync('git', ['status', '--short', '--', ':(top)aiao-desktop'], { encoding: 'utf8' }).trim()
    },
    environment: { os: platform(), release: release(), node: process.version },
    command: 'pnpm nx run aiao-desktop:inspect-live --args="--output=<文件>"',
    ...result
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (values.output) writeFileSync(resolve(values.output), json);
  console.log(json);
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
