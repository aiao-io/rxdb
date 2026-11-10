import { describe, expect, it } from 'vitest';
import { scanDirectivePrologue } from '../directive-prologue.js';

/** 序言本身的原文，便于直接对照插入点。 */
const prologueOf = (code: string): string => code.slice(0, scanDirectivePrologue(code).end);

describe('scanDirectivePrologue（RV-01a1bb4c7db9）', () => {
  it('没有指令时插入点在最前面', () => {
    expect(scanDirectivePrologue('exports.a = 1;')).toEqual({ end: 0, needsSemicolon: false, directives: [] });
  });

  it('跳过开头的 hashbang 行', () => {
    const code = '#!/usr/bin/env node\n"use strict";x();';

    expect(prologueOf(code)).toBe('#!/usr/bin/env node\n"use strict";');
    expect(scanDirectivePrologue('#!/usr/bin/env node\nx();').end).toBe('#!/usr/bin/env node'.length);
    expect(scanDirectivePrologue('#!only').end).toBe('#!only'.length);
  });

  it('读出全部指令原文：单双引号、转义字符原样保留', () => {
    const { directives } = scanDirectivePrologue(`"use client";'use\\x20strict';"say \\"hi\\"";x();`);

    expect(directives).toEqual(['use client', 'use\\x20strict', 'say \\"hi\\"']);
  });

  it('块注释里的换行同样触发自动分号插入；没写分号时标出要补分号', () => {
    const code = '"use strict" /* a\n b */ exports.a = 1;';

    expect(scanDirectivePrologue(code)).toEqual({
      end: '"use strict"'.length,
      needsSemicolon: true,
      directives: ['use strict']
    });
  });

  it('行分隔符 U+2028 也是换行', () => {
    const code = `"use strict"${String.fromCharCode(0x2028)}exports.a = 1;`;

    expect(scanDirectivePrologue(code).directives).toEqual(['use strict']);
  });

  it('文件末尾没写分号的指令照样成立；插语句前要补分号', () => {
    expect(scanDirectivePrologue('"use strict"')).toEqual({
      end: '"use strict"'.length,
      needsSemicolon: true,
      directives: ['use strict']
    });
  });

  it.each([
    ['同一行接着别的记号', '"use strict" exports.a = 1;'],
    ['换行后是运算符', '"use strict"\n+ suffix;'],
    ['换行后是 in', '"use strict"\nin object;'],
    ['换行后是 instanceof', '"use strict"\ninstanceof Ctor;'],
    ['换行后是右花括号', '"use strict"\n}'],
    ['未闭合的块注释', '"use strict" /* 没有结尾'],
    ['未闭合的字符串', '"use strict'],
    ['字符串里有裸换行', '"use\nstrict";']
  ])('%s：不是指令，插入点留在最前面', (_case, code) => {
    expect(scanDirectivePrologue(code)).toEqual({ end: 0, needsSemicolon: false, directives: [] });
  });

  it('换行后以 in 开头的标识符照常结束指令', () => {
    expect(scanDirectivePrologue('"use strict"\ninit();').directives).toEqual(['use strict']);
  });

  it('只认顶层序言：第一条普通语句之后的同名文本不算', () => {
    const code = 'var flag = "use strict"; "use strict";';

    expect(scanDirectivePrologue(code).directives).toEqual([]);
  });
});
