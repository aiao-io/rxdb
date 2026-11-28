import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePublishedPort, readLocalStack, readStudioUrl } from './local-stack.mjs';

const anonKey = 'eyJhbGciOiJIUzI1NiJ9.anon.signature';
const config = (environment = { SUPABASE_ANON_KEY: anonKey }) =>
  JSON.stringify({ name: 'rxdb-supabase-0123456789', services: { kong: { environment } } });

/** 假的 compose：按子命令返回预置输出，没有预置的子命令按「服务没在运行」失败 */
function fakeCompose(outputs) {
  return async args => {
    const output = outputs[args.join(' ')];
    if (output === undefined) throw new Error(`service "${args[1]}" is not running`);
    return output;
  };
}

test('应用连接的地址取 Kong 实际发布的宿主端口，anon key 取 compose 解析后的配置', async () => {
  const compose = fakeCompose({ 'config --format json': config(), 'port kong 8000': '0.0.0.0:55001\n' });
  assert.deepEqual(await readLocalStack(compose), {
    project: 'rxdb-supabase-0123456789',
    url: 'http://localhost:55001',
    anonKey
  });
});

test('Studio 只发布在回环地址，按 127.0.0.1 访问', async () => {
  const compose = fakeCompose({ 'port studio 3000': '127.0.0.1:63915\n' });
  assert.equal(await readStudioUrl(compose), 'http://127.0.0.1:63915');
});

test('发布端口兼容 IPv6 通配写法', () => {
  assert.equal(parsePublishedPort('[::]:55001\n'), 55001);
});

test('没有发布出来的端口直接失败，不当成可用地址', () => {
  assert.throws(() => parsePublishedPort('0.0.0.0:0\n'), /0\.0\.0\.0:0/);
  assert.throws(() => parsePublishedPort(''), /端口/);
});

test('栈没起时说明怎么启动，不猜一个固定端口', async () => {
  const compose = fakeCompose({ 'config --format json': config() });
  await assert.rejects(readLocalStack(compose), error => {
    assert.match(error.message, /kong/);
    assert.match(error.message, /pnpm nx dev dev-rxdb-supabase/);
    assert.match(error.cause.message, /not running/);
    return true;
  });
});

test('compose 配置里取不到 anon key 时失败，不把 undefined 交给 dev server 静默退回本地模式', async () => {
  const compose = fakeCompose({ 'config --format json': config({}), 'port kong 8000': '0.0.0.0:55001' });
  await assert.rejects(readLocalStack(compose), /SUPABASE_ANON_KEY/);
});
