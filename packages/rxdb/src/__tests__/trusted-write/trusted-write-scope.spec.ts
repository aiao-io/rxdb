/**
 * @fileoverview trusted-write/trusted-write-scope.ts —— 受信写的声明通道本身
 *
 * @remarks
 * 兄弟文件 `trusted-callsite-registry.spec.ts` 守的是**登记表**（表与 §3 逐格一致、核心自身
 * 零受信写）；这里守的是**通道**：声明怎么进来、怎么被取走、什么时候被拒。两件事分开，
 * 是因为登记表那侧在 US-025 之后已经看不见任何真实调用点，而通道的行为核心自己就能验完。
 *
 * US-025 把 9 个调用点搬进了 `@aiao/rxdb-plugin-history` 与 `@aiao/rxdb-plugin-sync`，
 * 于是核心自己的套件里再没有任何东西会调到 {@link declareTrustedWrite}。插件侧的用例调它，
 * 但它们调的都是**已登记**的那条路——fail-closed 的那条（未登记身份必须抛错）自此谁都没在验，
 * 而它恰好是 SC-010 的全部内容：放行未登记身份的话，新增一个批量重写调用点只需要随手编一个
 * 文件名就能绕开漂移扫描。
 *
 * 三件事在这里钉死：
 *
 * 1. **未登记身份抛错**，不是「按未知入口放行」。
 * 2. **作用域隔离**：声明挂在作用域对象上，两个并发写不会串台。全局变量会——
 *    A 声明了 `remote_sync`、还没走到写原语，B 声明了 `undo_redo`，A 的写就被记成 B 的意图。
 * 3. **取用即清除**：声明只对紧随其后的那一次写有效。留着不清的话，下一次没声明的写会
 *    悄悄继承上一次的身份，而那正是 fail-closed 要拒绝的情形。
 */

import { describe, expect, it } from 'vitest';
import { RxDBError } from '../../RxDBError.js';
import { TrustedWriteIntent } from '../../trusted-write/trusted-write-intent.js';
import type { TrustedWriteDeclaration } from '../../trusted-write/trusted-write-scope.js';
import { declareTrustedWrite, takeDeclaredWrite } from '../../trusted-write/trusted-write-scope.js';

/** 登记表 #1：`switchBranch` 的分支物化，入口为 `projection_rewrite`。 */
const BRANCH_MATERIALIZATION: TrustedWriteDeclaration = {
  file: 'VersionManager.ts',
  symbol: 'switchBranch',
  intent: TrustedWriteIntent.branch_materialization
};

/** 登记表 #4：undo / redo 的应用，入口为 `domain_recompute`——与 #1 不同行，用来验入口不是猜的。 */
const UNDO_REDO: TrustedWriteDeclaration = {
  file: 'undo-redo-apply.ts',
  symbol: 'applyUndoRedoHistories',
  intent: TrustedWriteIntent.undo_redo
};

/** 作用域对象在真实链路上是适配器实例或事务 executor；通道只拿它当 WeakMap 的键。 */
const createScope = (): object => ({});

describe('declareTrustedWrite：未登记身份一律拒', () => {
  it('编造的文件名抛错', () => {
    expect(() =>
      declareTrustedWrite(createScope(), {
        file: 'not-registered.ts',
        symbol: 'switchBranch',
        intent: TrustedWriteIntent.branch_materialization
      })
    ).toThrow(RxDBError);
  });

  it('文件与符号都对、只有意图换了一个，同样抛错', () => {
    // 三段是一个整体的键。只比对其中两段的话，改一行的意图就能静悄悄换掉它的入口分类。
    expect(() =>
      declareTrustedWrite(createScope(), { ...BRANCH_MATERIALIZATION, intent: TrustedWriteIntent.undo_redo })
    ).toThrow(RxDBError);
  });

  it('错误信息点名三段身份与补救动作', () => {
    // 报错要能直接照着做：缺的那一行在哪张表里、改完之后去哪儿对账。
    expect(() =>
      declareTrustedWrite(createScope(), { ...BRANCH_MATERIALIZATION, symbol: 'switchBranchFacade' })
    ).toThrow(/VersionManager\.ts·switchBranchFacade·branch_materialization[\s\S]*TRUSTED_CALLSITE_REGISTRY/);
  });

  it('被拒的声明不会留在作用域上', () => {
    const scope = createScope();

    expect(() => declareTrustedWrite(scope, { ...BRANCH_MATERIALIZATION, file: 'forged.ts' })).toThrow(RxDBError);

    expect(takeDeclaredWrite(scope)).toBeUndefined();
  });
});

describe('declareTrustedWrite：已登记身份补上入口', () => {
  it('入口取自登记表，不由调用点自报', () => {
    // 调用点也报一份入口的话，改一处漏一处时没有任何东西会报错。
    const scope = createScope();

    declareTrustedWrite(scope, BRANCH_MATERIALIZATION);

    expect(takeDeclaredWrite(scope)).toEqual({ ...BRANCH_MATERIALIZATION, entrance: 'projection_rewrite' });
  });

  it('另一行给出另一个入口', () => {
    const scope = createScope();

    declareTrustedWrite(scope, UNDO_REDO);

    expect(takeDeclaredWrite(scope)?.entrance).toBe('domain_recompute');
  });

  it('同一作用域上后一次声明覆盖前一次', () => {
    // 一个作用域至多一条待取用的声明：留着两条的话，取用顺序就成了第二份真相。
    const scope = createScope();

    declareTrustedWrite(scope, BRANCH_MATERIALIZATION);
    declareTrustedWrite(scope, UNDO_REDO);

    expect(takeDeclaredWrite(scope)).toEqual({ ...UNDO_REDO, entrance: 'domain_recompute' });
  });
});

describe('takeDeclaredWrite：取用即清除，且按作用域隔离', () => {
  it('没有声明时返回 undefined', () => {
    expect(takeDeclaredWrite(createScope())).toBeUndefined();
  });

  it('取过一次之后就没了——下一次没声明的写不继承上一次的身份', () => {
    const scope = createScope();
    declareTrustedWrite(scope, UNDO_REDO);

    expect(takeDeclaredWrite(scope)).toBeDefined();
    expect(takeDeclaredWrite(scope)).toBeUndefined();
  });

  it('两个作用域各自持有自己的声明，不串台', () => {
    const first = createScope();
    const second = createScope();

    declareTrustedWrite(first, BRANCH_MATERIALIZATION);
    declareTrustedWrite(second, UNDO_REDO);

    // 取用顺序与声明顺序相反：全局变量实现下，这里拿到的会是两份同样的 UNDO_REDO。
    expect(takeDeclaredWrite(second)?.intent).toBe(TrustedWriteIntent.undo_redo);
    expect(takeDeclaredWrite(first)?.intent).toBe(TrustedWriteIntent.branch_materialization);
  });

  it('在一个作用域上取用，不会清掉另一个作用域的声明', () => {
    const first = createScope();
    const second = createScope();
    declareTrustedWrite(first, BRANCH_MATERIALIZATION);
    declareTrustedWrite(second, UNDO_REDO);

    takeDeclaredWrite(first);

    expect(takeDeclaredWrite(second)).toBeDefined();
  });
});
