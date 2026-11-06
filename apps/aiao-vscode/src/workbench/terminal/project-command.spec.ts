import { describe, expect, it } from 'vitest';
import type { WorkbenchFiles } from '../session.js';
import { projectRunPlan } from './project-command.js';

function files(manifest: unknown, extra: WorkbenchFiles = {}): WorkbenchFiles {
  return { 'package.json': JSON.stringify(manifest), ...extra };
}

describe('项目终端启动计划', () => {
  it('优先执行 dev，仅返回固定包管理器和脚本名', () => {
    expect(projectRunPlan(files({ scripts: { dev: 'vite --host', start: 'node server.js' } })))
      .toEqual({ manager: 'npm', script: 'dev' });
  });

  it.each([undefined, '', '  ', 1, false, null])('dev 为 %s 时选择非空 start', dev => {
    expect(projectRunPlan(files({ scripts: { dev, start: 'node server.js' } })))
      .toEqual({ manager: 'npm', script: 'start' });
  });

  it('读取根目录 UTF-8 二进制清单，不使用子目录清单', () => {
    expect(projectRunPlan({
      'package.json': new TextEncoder().encode('{"scripts":{"start":"node server.js"}}'),
      'app/package.json': '{"scripts":{"dev":"vite"}}'
    })).toEqual({ manager: 'npm', script: 'start' });
  });

  it.each(['pnpm@10.0.0', 'pnpm@10.0.0+sha512.abc'])('使用清单声明的 %s', packageManager => {
    expect(projectRunPlan(files({ packageManager, scripts: { dev: 'vite' } }, { 'package-lock.json': '{}' })))
      .toEqual({ manager: 'pnpm', script: 'dev' });
  });

  it('清单的 npm 声明优先于 pnpm 锁文件', () => {
    expect(projectRunPlan(files({ packageManager: 'npm@11.0.0', scripts: { start: 'node server.js' } }, { 'pnpm-lock.yaml': '' })))
      .toEqual({ manager: 'npm', script: 'start' });
  });

  it('未声明包管理器时优先采用根目录 pnpm 锁文件', () => {
    expect(projectRunPlan(files({ scripts: { dev: 'vite' } }, { 'pnpm-lock.yaml': '', 'package-lock.json': '{}' })))
      .toEqual({ manager: 'pnpm', script: 'dev' });
  });

  it.each(['package-lock.json', 'npm-shrinkwrap.json', 'nested/pnpm-lock.yaml'])('只有 %s 时使用 npm', path => {
    expect(projectRunPlan(files({ scripts: { dev: 'vite' } }, { [path]: '{}' })))
      .toEqual({ manager: 'npm', script: 'dev' });
  });

  it('缺少根目录清单时明确报错', () => {
    expect(() => projectRunPlan({ 'app/package.json': '{"scripts":{"dev":"vite"}}' }))
      .toThrow('项目根目录缺少 package.json');
  });

  it.each(['{', new Uint8Array([0xff])])('拒绝 JSON 语法或 UTF-8 编码错误', source => {
    expect(() => projectRunPlan({ 'package.json': source })).toThrow('package.json 不是有效的 JSON');
  });

  it.each([null, [], 'manifest', 1, false])('拒绝非对象清单 %s', manifest => {
    expect(() => projectRunPlan(files(manifest))).toThrow('package.json 必须是对象');
  });

  it.each([undefined, null, [], 'vite', {}, { dev: '', start: ' ' }, { dev: 1, start: false }])('没有有效启动脚本时明确报错 %s', scripts => {
    expect(() => projectRunPlan(files({ scripts }))).toThrow('scripts.dev 或 scripts.start');
  });

  it.each([null, false, 10, '', 'pnpm', 'pnpm@', 'yarn@4.0.0', 'pnpm@10.0.0 extra'])('拒绝不支持的包管理器声明 %s', packageManager => {
    expect(() => projectRunPlan(files({ packageManager, scripts: { dev: 'vite' } })))
      .toThrow('packageManager 仅支持 npm@版本 或 pnpm@版本');
  });
});
