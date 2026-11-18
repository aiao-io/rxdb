import { describe, expect, it } from 'vitest';
import { CollaborationError } from '../model.js';
import { unavailable, unavailableReason } from './availability.js';

/** pg 的 DatabaseError 形状：带严重级别与 SQLSTATE。 */
const database = (code: string, message = 'database error') =>
  Object.assign(new Error(message), { severity: 'ERROR', code });
const socket = (code: string) => Object.assign(new Error(`connect ${code}`), { code, errno: -1, syscall: 'connect' });

describe('暂时不可用的识别（ADMIN-US-220 AC#5）', () => {
  it.each([
    ['取连接超时（pg-pool）', new Error('timeout exceeded when trying to connect'), 'pool'],
    ['数据库连接数用尽', database('53300', 'too many connections for role "admin_collaboration"'), 'pool'],
    ['PgBouncer 排队等服务端连接超时', database('08P01', 'query_wait_timeout'), 'pool'],
    [
      'Supavisor 取连接排队超时',
      database('XX000', '(ECHECKOUTTIMEOUT) unable to check out connection from the pool due to timeout'),
      'pool'
    ],
    ['Supavisor 客户端连接数用尽', database('XX000', '(EMAXCONNSESSION) max clients reached in session mode'), 'pool'],
    ['语句超时', database('57014', 'canceling statement due to statement timeout'), 'timeout'],
    ['等锁超时', database('55P03', 'canceling statement due to lock timeout'), 'timeout'],
    ['事务空闲超时', database('25P03', 'terminating connection due to idle-in-transaction timeout'), 'timeout'],
    ['连接异常', database('08006'), 'connection'],
    ['数据库正在关闭', database('57P01', 'terminating connection due to administrator command'), 'connection'],
    ['连接被拒', socket('ECONNREFUSED'), 'connection'],
    ['连接被重置', socket('ECONNRESET'), 'connection'],
    ['写入已断开的连接', socket('EPIPE'), 'connection'],
    ['连接意外中断', new Error('Connection terminated unexpectedly'), 'connection'],
    ['连接已不可用', new Error('Client has encountered a connection error and is not queryable'), 'connection'],
    ['序列化失败', database('40001'), 'conflict'],
    ['死锁', database('40P01'), 'conflict']
  ])('%s → %s', (_label, error, reason) => {
    expect(unavailableReason(error)).toBe(reason);
  });
  it.each([
    ['口令错误（部署配置问题，重试也不会好）', database('28P01', 'password authentication failed')],
    ['其他内部错误', database('XX000', 'internal error')],
    ['权限不足', database('42501', 'permission denied for table workspaces')],
    ['唯一约束冲突', database('23505')],
    ['程序缺陷', new TypeError('Cannot read properties of undefined')],
    ['业务错误', new CollaborationError('forbidden', '当前用户没有操作权限')],
    ['非错误对象', 'timeout exceeded when trying to connect']
  ])('%s不算暂时不可用', (_label, error) => {
    expect(unavailableReason(error)).toBeUndefined();
  });
  it('可重试错误带稳定的错误码、原因与建议等待的秒数', () => {
    expect(unavailable('pool')).toMatchObject({
      code: 'unavailable',
      message: '服务暂时不可用，请稍后按原请求重试',
      details: { reason: 'pool', retryAfter: 1 }
    });
    expect(unavailable('timeout').details).toEqual({ reason: 'timeout', retryAfter: 2 });
  });
});
