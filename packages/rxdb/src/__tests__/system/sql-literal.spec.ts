/**
 * @fileoverview system/sql-literal.ts —— 六后端共用 CAS 语句时的字面量与标识符拼装
 *
 * @remarks
 * 这五个函数是核心**唯一**自己拼 SQL 字符串的地方，而它们的全部价值都在**拒绝**上：
 * 走占位符的路径由适配器负责转义，这里没有占位符可依赖，所以「转不动就抛」与
 * 「转得动就转对」是同一件事的两面。放行一个转不动的输入不会当场报错，只会拼出一条
 * 语法正确、语义错误的语句——`sqlIntegerLiteral(NaN)` 在 PostgreSQL 上甚至是合法的
 * 浮点输入，于是 CAS 的判据静悄悄换成了另一个判据。
 *
 * US-025 把两处调用点（`commit/commit-capability.ts` 与 `commit/write-commit.ts`）搬进了
 * `@aiao/rxdb-plugin-working-tree`，本模块留在核心 —— 转义与命名规则六个后端共用，
 * 不该随某一个插件走。搬迁之后核心自己的套件够不着它，因此这里按**核心原语**的身份
 * 给它补上直接的判据：每个函数各自的转义正确性，以及各自那条拒绝路径。
 */

import { describe, expect, it } from 'vitest';
import { RxDBError } from '../../RxDBError.js';
import {
  quoteSqlIdentifier,
  sqlBooleanLiteral,
  sqlIntegerLiteral,
  sqlStringLiteral,
  sqlTimestampLiteral
} from '../../system/sql-literal.js';

/**
 * PostgreSQL 拒整条语句、SQLite 静默截断的那个字符。
 *
 * @remarks
 * 用 `String.fromCharCode` 而不是内联转义：裸的 NUL 在 diff、终端与大多数编辑器里都不可见，
 * 而这几条用例的全部内容就是「它在不在」。
 */
const NUL = String.fromCharCode(0);

describe('quoteSqlIdentifier', () => {
  it('包成双引号形式', () => {
    expect(quoteSqlIdentifier('enabledAt')).toBe('"enabledAt"');
  });

  it('保留大小写——不加引号时 PGlite 会折成小写，驼峰列名当场找不到', () => {
    expect(quoteSqlIdentifier('headRevision')).toBe('"headRevision"');
  });

  it('内部双引号按 SQL 标准加倍', () => {
    expect(quoteSqlIdentifier('we"ird')).toBe('"we""ird"');
  });

  it('空标识符抛错，而不是拼出一对空引号', () => {
    // `""` 在两边都是语法合法的定界标识符，落库之后才发现它指向一个不存在的列。
    expect(() => quoteSqlIdentifier('')).toThrow(RxDBError);
  });

  it('含 NUL 的标识符抛错', () => {
    expect(() => quoteSqlIdentifier(`tab${NUL}le`)).toThrow(RxDBError);
  });
});

describe('sqlStringLiteral', () => {
  it('包成单引号形式', () => {
    expect(sqlStringLiteral('main')).toBe("'main'");
  });

  it('内部单引号加倍', () => {
    expect(sqlStringLiteral("o'neil")).toBe("'o''neil'");
  });

  it('反斜杠原样留着——两个后端都不把它当转义符，再处理一次就是改值', () => {
    expect(sqlStringLiteral('a\\b')).toBe("'a\\b'");
  });

  it('含 NUL 抛错', () => {
    expect(() => sqlStringLiteral(`a${NUL}b`)).toThrow(RxDBError);
  });
});

describe('sqlIntegerLiteral', () => {
  it('安全整数拼成十进制字面量', () => {
    expect(sqlIntegerLiteral(42)).toBe('42');
  });

  it('负数与零都收', () => {
    expect([sqlIntegerLiteral(-1), sqlIntegerLiteral(0)]).toEqual(['-1', '0']);
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['小数', 1.5],
    ['超出安全整数', Number.MAX_SAFE_INTEGER + 2]
  ])('%s 抛错——它们都能通过语法检查，然后比较出错误的结果', (_label, value) => {
    expect(() => sqlIntegerLiteral(value)).toThrow(RxDBError);
  });
});

describe('sqlBooleanLiteral', () => {
  it('两个值都拼成关键字，不按后端分叉成 1 / 0', () => {
    expect([sqlBooleanLiteral(true), sqlBooleanLiteral(false)]).toEqual(['true', 'false']);
  });
});

describe('sqlTimestampLiteral', () => {
  it('拼成 UTC 的 ISO 8601 字符串字面量', () => {
    expect(sqlTimestampLiteral(new Date('2026-09-16T01:02:03.000Z'))).toBe("'2026-09-16T01:02:03.000Z'");
  });

  it('非 UTC 输入也归一到 UTC——两边的日期列存的都是 ISO 文本', () => {
    expect(sqlTimestampLiteral(new Date('2026-09-16T09:02:03.000+08:00'))).toBe("'2026-09-16T01:02:03.000Z'");
  });

  it('Invalid Date 抛错，而不是拼出 `Invalid Date` 这个字符串', () => {
    expect(() => sqlTimestampLiteral(new Date('不是日期'))).toThrow(RxDBError);
  });
});
