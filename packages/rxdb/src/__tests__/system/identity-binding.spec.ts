/**
 * @fileoverview 本地库与身份绑定的纯函数面（US-035）。
 *
 * @remarks
 * 这一层防的事故没有编译期形态：同一个本地库换了登录身份，上一个身份同步下来的行仍在库里，
 * 下一个身份离线打开就读得到。所以断言集中在三件事上：
 *
 * 1. **身份键与库名**：确定、互不相撞、不泄露用户 id 原文；
 * 2. **库内绑定的核对**：对不上就抛，且「带前缀但读不懂」不能被当成「没绑定」；
 * 3. **与远端交换数据前的核对**：每次都问当前调用者，不缓存，对不上就抛。
 */

import { firstValueFrom, lastValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RxDBError } from '../../RxDBError.js';
import {
  assertCallerIdentity,
  assertIdentityBinding,
  assertRxDBIdentity,
  createIdentityGuardedQueryCacheRemote,
  getRxDBIdentityDatabaseName,
  getRxDBIdentityKey,
  identityWatermarkName,
  RXDB_ANONYMOUS_SUBJECT,
  RXDB_IDENTITY_WATERMARK_PREFIX,
  RxDBIdentityMismatchError,
  type RxDBIdentity
} from '../../system/identity-binding.js';

const SCOPE = 'https://project-a.supabase.co';
const USER_A = '00000000-0000-4000-8000-0000000000a1';
const USER_B = '00000000-0000-4000-8000-0000000000b2';

const identityOf = (subject: string, scope = SCOPE): RxDBIdentity => ({ scope, subject });
const remoteIdentity = (subject: string, scope = SCOPE): RxDBIdentity => identityOf(subject, scope);

describe('身份键', () => {
  it('同一组输入得到同一个键，是 64 位小写十六进制', () => {
    const key = getRxDBIdentityKey(identityOf(USER_A));
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(getRxDBIdentityKey(identityOf(USER_A))).toBe(key);
  });

  it('身份不同、后端不同，键都不同', () => {
    const keys = new Set([
      getRxDBIdentityKey(identityOf(RXDB_ANONYMOUS_SUBJECT)),
      getRxDBIdentityKey(identityOf(USER_A)),
      getRxDBIdentityKey(identityOf(USER_B)),
      getRxDBIdentityKey(identityOf(USER_A, 'https://project-b.supabase.co'))
    ]);
    expect(keys.size).toBe(4);
  });

  it('后端标识与身份的拼接没有歧义：("a","bc") 与 ("ab","c") 是两个键', () => {
    expect(getRxDBIdentityKey({ scope: 'a', subject: 'bc' })).not.toBe(
      getRxDBIdentityKey({ scope: 'ab', subject: 'c' })
    );
  });

  it('键里不含用户 id 与后端标识的原文', () => {
    const key = getRxDBIdentityKey(identityOf(USER_A));
    expect(key).not.toContain(USER_A);
    expect(key).not.toContain('supabase');
  });
});

describe('按身份算库名', () => {
  it('anon、A、B 三个名字互不相同；重复计算结果不变；不含用户 id 原文', () => {
    const names = [RXDB_ANONYMOUS_SUBJECT, USER_A, USER_B].map(subject =>
      getRxDBIdentityDatabaseName('todo', identityOf(subject))
    );
    expect(new Set(names).size).toBe(3);
    expect(getRxDBIdentityDatabaseName('todo', identityOf(USER_A))).toBe(names[1]);
    for (const name of names) {
      expect(name.startsWith('todo-')).toBe(true);
      expect(name).not.toContain(USER_A);
      expect(name).not.toContain(USER_B);
    }
  });

  it('同一个身份、两个不同的后端标识，名字不同', () => {
    expect(getRxDBIdentityDatabaseName('todo', identityOf(USER_A))).not.toBe(
      getRxDBIdentityDatabaseName('todo', identityOf(USER_A, 'https://project-b.supabase.co'))
    );
  });

  it('基础名为空时拒绝', () => {
    expect(() => getRxDBIdentityDatabaseName('', identityOf(USER_A))).toThrow(RxDBError);
  });
});

describe('身份声明的形状', () => {
  it.each([
    ['缺后端标识', { scope: '', subject: USER_A }],
    ['缺身份', { scope: SCOPE, subject: '' }],
    ['后端标识不是字符串', { scope: 1, subject: USER_A }],
    ['身份不是字符串', { scope: SCOPE, subject: undefined }],
    ['不是对象', 'user-a']
  ])('%s：拒绝', (_label, identity) => {
    expect(() => assertRxDBIdentity(identity as unknown as RxDBIdentity)).toThrow(RxDBError);
  });

  it('合法声明放行', () => {
    expect(() => assertRxDBIdentity(identityOf(USER_A))).not.toThrow();
  });
});

describe('库内绑定的核对', () => {
  const keyA = getRxDBIdentityKey(identityOf(USER_A));
  const keyB = getRxDBIdentityKey(identityOf(USER_B));

  it('行名带前缀，能原样读回身份键', () => {
    expect(identityWatermarkName(keyA)).toBe(`${RXDB_IDENTITY_WATERMARK_PREFIX}${keyA}`);
  });

  it('没有声明身份：不核对，返回 false', () => {
    expect(assertIdentityBinding([identityWatermarkName(keyA)], undefined)).toBe(false);
  });

  it('库里没有绑定行：放行，返回 false（调用方据此决定要不要绑定）', () => {
    expect(assertIdentityBinding(['0001-init', '__rxdb_system_schema__:9'], keyA)).toBe(false);
  });

  it('库已绑定的就是本身份：放行，返回 true', () => {
    expect(assertIdentityBinding(['0001-init', identityWatermarkName(keyA)], keyA)).toBe(true);
  });

  it('库已绑定别的身份：抛身份不匹配，带上两边的键', () => {
    let thrown: unknown;
    try {
      assertIdentityBinding([identityWatermarkName(keyA)], keyB);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RxDBIdentityMismatchError);
    expect(thrown).toBeInstanceOf(RxDBError);
    expect(thrown).toMatchObject({ source: 'database', clientKey: keyB, foundKeys: [keyA] });
  });

  it('库里同时有本身份与别的身份的行：同样拒绝（不能因为「也有我的」就放行）', () => {
    expect(() => assertIdentityBinding([identityWatermarkName(keyA), identityWatermarkName(keyB)], keyB)).toThrow(
      RxDBIdentityMismatchError
    );
  });

  it('报错文案不含用户 id 原文，并指向按身份算库名的工具', () => {
    const error = (() => {
      try {
        assertIdentityBinding([identityWatermarkName(keyA)], keyB);
      } catch (thrown) {
        return thrown as Error;
      }
      throw new Error('expected a throw');
    })();
    expect(error.message).not.toContain(USER_A);
    expect(error.message).not.toContain(USER_B);
    expect(error.message).toContain('getRxDBIdentityDatabaseName');
  });
});

describe('与远端交换数据前的核对', () => {
  it('没有声明身份：不问远端', async () => {
    const callerIdentity = vi.fn(async () => remoteIdentity(USER_B));
    await expect(assertCallerIdentity(undefined, { callerIdentity })).resolves.toBeUndefined();
    expect(callerIdentity).not.toHaveBeenCalled();
  });

  it('远端报告的就是声明的身份：放行', async () => {
    await expect(
      assertCallerIdentity(identityOf(USER_A), { callerIdentity: async () => remoteIdentity(USER_A) })
    ).resolves.toBeUndefined();
  });

  it('未登录声明为 anon，远端报告 anon：放行', async () => {
    await expect(
      assertCallerIdentity(identityOf(RXDB_ANONYMOUS_SUBJECT), {
        callerIdentity: async () => remoteIdentity(RXDB_ANONYMOUS_SUBJECT)
      })
    ).resolves.toBeUndefined();
  });

  it('远端会话实际是别的身份：抛身份不匹配，带上两边的键', async () => {
    const error = await assertCallerIdentity(identityOf(USER_A), {
      callerIdentity: async () => remoteIdentity(USER_B)
    }).catch((rejection: unknown) => rejection);
    expect(error).toBeInstanceOf(RxDBIdentityMismatchError);
    expect(error).toMatchObject({
      source: 'remote',
      clientKey: getRxDBIdentityKey(identityOf(USER_A)),
      foundKeys: [getRxDBIdentityKey(identityOf(USER_B))]
    });
    expect((error as Error).message).not.toContain(USER_A);
    expect((error as Error).message).not.toContain(USER_B);
  });

  it('登录用户的库遇到未登录的会话：同样拒绝', async () => {
    await expect(
      assertCallerIdentity(identityOf(USER_A), { callerIdentity: async () => remoteIdentity(RXDB_ANONYMOUS_SUBJECT) })
    ).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
  });

  it('每次都问，不缓存：同一个适配器前后两次答案不同，两次各自判定', async () => {
    const answers = [USER_A, USER_B];
    const remote = { callerIdentity: async () => remoteIdentity(answers.shift() as string) };
    await expect(assertCallerIdentity(identityOf(USER_A), remote)).resolves.toBeUndefined();
    await expect(assertCallerIdentity(identityOf(USER_A), remote)).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
  });

  it('远端适配器不报告调用者身份：拒绝，不当作通过', async () => {
    const error = await assertCallerIdentity(identityOf(USER_A), {}).catch((rejection: unknown) => rejection);
    expect(error).toBeInstanceOf(RxDBError);
    expect(error).not.toBeInstanceOf(RxDBIdentityMismatchError);
    expect((error as Error).message).toContain('callerIdentity');
  });

  it('远端报告了空身份：拒绝，不当作 anon', async () => {
    await expect(
      assertCallerIdentity(identityOf(USER_A), { callerIdentity: async () => ({ scope: '', subject: '' }) })
    ).rejects.toBeInstanceOf(RxDBError);
  });
});

describe('QueryCache 的远端守卫', () => {
  const createRemote = () => ({
    fetchMetadata: vi.fn(() => of([{ id: '1', updatedAt: '2026-11-20T00:00:00.000Z' }])),
    findByIds: vi.fn(() => of([{ id: '1' }])),
    create: vi.fn((_entity: string, data: unknown) => of(data)),
    update: vi.fn((_entity: string, _id: string, data: unknown) => of(data)),
    delete: vi.fn(() => of(undefined))
  });

  it('没有声明身份：原样返回同一个对象', () => {
    const remote = createRemote();
    expect(createIdentityGuardedQueryCacheRemote(undefined, remote as never)).toBe(remote);
  });

  it('身份对得上：五个入口都照常转发', async () => {
    const remote = createRemote();
    const guarded = createIdentityGuardedQueryCacheRemote(identityOf(USER_A), {
      ...remote,
      callerIdentity: async () => remoteIdentity(USER_A)
    } as never);

    await expect(firstValueFrom(guarded.fetchMetadata('Todo', { combinator: 'and', rules: [] }))).resolves.toHaveLength(
      1
    );
    await expect(firstValueFrom(guarded.findByIds('Todo', ['1']))).resolves.toEqual([{ id: '1' }]);
    await expect(firstValueFrom(guarded.create!('Todo', { id: '2' }))).resolves.toEqual({ id: '2' });
    await expect(firstValueFrom(guarded.update!('Todo', '2', { title: 'x' }))).resolves.toEqual({ title: 'x' });
    await expect(lastValueFrom(guarded.delete!('Todo', ['2']))).resolves.toBeUndefined();
    expect(remote.fetchMetadata).toHaveBeenCalledTimes(1);
    expect(remote.delete).toHaveBeenCalledWith('Todo', ['2']);
  });

  it('远端会话是别的身份：五个入口都先报身份不匹配，一个远端请求都不发', async () => {
    const remote = createRemote();
    const guarded = createIdentityGuardedQueryCacheRemote(identityOf(USER_A), {
      ...remote,
      callerIdentity: async () => remoteIdentity(USER_B)
    } as never);

    await expect(
      firstValueFrom(guarded.fetchMetadata('Todo', { combinator: 'and', rules: [] }))
    ).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
    await expect(firstValueFrom(guarded.findByIds('Todo', ['1']))).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
    await expect(firstValueFrom(guarded.create!('Todo', { id: '2' }))).rejects.toBeInstanceOf(
      RxDBIdentityMismatchError
    );
    await expect(firstValueFrom(guarded.update!('Todo', '2', {}))).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
    await expect(firstValueFrom(guarded.delete!('Todo', '2'))).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
    for (const method of Object.values(remote)) expect(method).not.toHaveBeenCalled();
  });

  it('订阅之前不核对也不发请求；每次订阅各核对一次', async () => {
    const remote = createRemote();
    const callerIdentity = vi.fn(async () => remoteIdentity(USER_A));
    const guarded = createIdentityGuardedQueryCacheRemote(identityOf(USER_A), { ...remote, callerIdentity } as never);

    const request$ = guarded.findByIds('Todo', ['1']);
    expect(callerIdentity).not.toHaveBeenCalled();
    expect(remote.findByIds).not.toHaveBeenCalled();

    await firstValueFrom(request$);
    await firstValueFrom(request$);
    expect(callerIdentity).toHaveBeenCalledTimes(2);
    expect(remote.findByIds).toHaveBeenCalledTimes(2);
  });

  it('远端没有的可选写入口，守卫之后同样没有（引擎靠它判断能力）', () => {
    const { fetchMetadata, findByIds } = createRemote();
    const readOnly = { fetchMetadata, findByIds };
    const guarded = createIdentityGuardedQueryCacheRemote(identityOf(USER_A), {
      ...readOnly,
      callerIdentity: async () => remoteIdentity(USER_A)
    } as never);
    expect(guarded.create).toBeUndefined();
    expect(guarded.update).toBeUndefined();
    expect(guarded.delete).toBeUndefined();
  });

  it('远端自己的错误原样传出，不被守卫吞掉', async () => {
    const boom = new Error('offline');
    const remote = { ...createRemote(), findByIds: vi.fn(() => throwError(() => boom)) };
    const guarded = createIdentityGuardedQueryCacheRemote(identityOf(USER_A), {
      ...remote,
      callerIdentity: async () => remoteIdentity(USER_A)
    } as never);
    await expect(firstValueFrom(guarded.findByIds('Todo', ['1']))).rejects.toBe(boom);
  });
});
