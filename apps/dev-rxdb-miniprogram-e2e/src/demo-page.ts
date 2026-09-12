import automator from 'miniprogram-automator';

/** automator 的类型只从实例方法推得出来，deep import 它的内部路径没有必要。 */
export type MiniProgram = Awaited<ReturnType<typeof automator.launch>>;
type MiniProgramPage = NonNullable<Awaited<ReturnType<MiniProgram['currentPage']>>>;
type MiniProgramElement = NonNullable<Awaited<ReturnType<MiniProgramPage['$']>>>;

/** 页面 `phase` 徽标的四种终态，与 `src/pages/index/index.tsx` 的 `DemoPhase` 一一对应。 */
const PHASE_CLASS = {
  ready: 'phase-ready',
  blocked: 'phase-blocked',
  error: 'phase-error'
} as const;

const READY_TIMEOUT_MS = 120_000;
const OPERATION_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

/** 一行「运行时能力」的读数。 */
export interface CapabilityReading {
  readonly name: string;
  readonly status: string;
}

/** 一行「验证状态」的读数。 */
export interface CheckReading {
  readonly name: string;
  readonly status: string;
  readonly detail: string;
}

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function textOf(scope: MiniProgramElement, selector: string): Promise<string> {
  const element = await scope.$(selector);
  if (!element) throw new Error(`没找到元素: ${selector}`);
  return (await element.text()).trim();
}

/**
 * 演示页的页面对象。
 *
 * 所有断言都走 WXML 上的类名，与 `index.tsx` 渲染的结构耦合；类名变了这里要一起改。
 * 这是刻意的：e2e 要验的是**用户看得见的那一层**，读 React state 就绕过了 Taro 的渲染管线，
 * 而那条管线本身正是小程序端最容易出问题的地方。
 */
export class DemoPage {
  constructor(
    private readonly page: MiniProgramPage,
    private readonly miniProgram: MiniProgram
  ) {}

  /** 当前 `phase` 徽标的文案（初始化中 / 数据库已连接 / 运行时不满足要求 / 初始化失败）。 */
  async phaseText(): Promise<string> {
    const badge = await this.page.$('.phase');
    if (!badge) throw new Error('没找到 phase 徽标，页面可能没渲染出来');
    return (await badge.text()).trim();
  }

  /** 顶部「状态」栏的文案，失败时它承载具体原因。 */
  async operationText(): Promise<string> {
    const values = await this.page.$$('.summary-version .summary-value');
    const [value] = values as readonly MiniProgramElement[];
    if (!value) throw new Error('没找到状态栏');
    return (await value.text()).trim();
  }

  /**
   * 等到数据库连上。
   *
   * 不用 `page.waitFor('.phase-ready')`：那样 `blocked` / `error` 两种终态会一路等到超时，
   * 报出来的是「等了 120 秒」而不是「运行时缺 WXWebAssembly」。这里主动识别失败态并把
   * 状态栏文案抬出来当错误信息。
   */
  async waitUntilReady(): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await this.page.$(`.${PHASE_CLASS.ready}`)) return;
      const failure = await this.readFailedPhase();
      if (failure) throw new Error(failure);
      await delay(POLL_INTERVAL_MS);
    }
    throw new Error(`等待数据库连接超时（${READY_TIMEOUT_MS}ms），当前状态: ${await this.operationText()}`);
  }

  /** 读出「运行时能力」表格的全部行。 */
  async capabilities(): Promise<readonly CapabilityReading[]> {
    const rows = (await this.page.$$('.capability-row')) as readonly MiniProgramElement[];
    return Promise.all(rows.map(row => this.readCapability(row)));
  }

  /** 按能力名取一行；取不到就抛错，而不是返回 undefined 让断言写成宽松匹配。 */
  async capability(name: string): Promise<CapabilityReading> {
    const all = await this.capabilities();
    const found = all.find(item => item.name === name);
    if (!found) throw new Error(`没有名为「${name}」的能力行，实际有: ${all.map(item => item.name).join(', ')}`);
    return found;
  }

  /** 读出「验证状态」表格的全部行。 */
  async checks(): Promise<readonly CheckReading[]> {
    const rows = (await this.page.$$('.check-row')) as readonly MiniProgramElement[];
    return Promise.all(rows.map(row => this.readCheck(row)));
  }

  /** 按名字取一条验证项。 */
  async check(name: string): Promise<CheckReading> {
    const all = await this.checks();
    const found = all.find(item => item.name === name);
    if (!found) throw new Error(`没有名为「${name}」的验证项，实际有: ${all.map(item => item.name).join(', ')}`);
    return found;
  }

  /** 当前 Todo 列表的标题，顺序与页面一致。 */
  async todoTitles(): Promise<readonly string[]> {
    const rows = (await this.page.$$('.todo-title')) as readonly MiniProgramElement[];
    return Promise.all(rows.map(async row => (await row.text()).trim()));
  }

  /** 通过输入框 + 添加按钮走完整 UI 路径新增一条 Todo。 */
  async addTodo(title: string): Promise<void> {
    const input = await this.page.$('.todo-input');
    if (!(input instanceof automator.InputElement)) {
      throw new Error('.todo-input 不是输入框元素，页面结构可能变了');
    }
    await input.input(title);
    await this.tap('.add-button');
    await this.waitForOperation('Todo 已添加');
  }

  /** 点掉第 `index` 行的删除按钮。 */
  async removeTodoAt(index: number): Promise<void> {
    const buttons = (await this.page.$$('.remove-button')) as readonly MiniProgramElement[];
    const button = buttons[index];
    if (!button) throw new Error(`第 ${index} 行没有删除按钮，当前只有 ${buttons.length} 行`);
    await button.tap();
    await this.waitForOperation('Todo 已删除');
  }

  /** 勾选/取消第 `index` 行的复选框。 */
  async toggleTodoAt(index: number): Promise<void> {
    const boxes = (await this.page.$$('.todo-main')) as readonly MiniProgramElement[];
    const box = boxes[index];
    if (!box) throw new Error(`第 ${index} 行没有复选框，当前只有 ${boxes.length} 行`);
    await box.tap();
    await this.waitForOperation('Todo 已更新');
  }

  /**
   * 点「重置数据」并等到清空完成。
   *
   * 复位走应用自己的 DELETE，而不是删掉落盘目录：目录在连接活着时由 VFS 缓冲着，
   * 此刻删它，连接关闭时的脏页回写会把整个库原样刷回来——探针会「复活」，
   * 「跨启动持久化」那条检查于是读到上一轮的结果，红得毫无道理。
   */
  async resetDemoData(): Promise<void> {
    await this.tap('.reset-button');
    await this.waitForOperation('演示数据已清空');
  }

  /** 点「重跑验证」并等到验证结束。 */
  async rerunVerification(): Promise<void> {
    await this.tap('.verify-button');
    await this.waitForOperation('数据库验证完成');
  }

  /**
   * 在小程序逻辑层里求值，用来验证 UI 看不见的运行时事实。
   *
   * `fn` 会被 `toString()` 后送进小程序引擎，所以它**必须自包含**：
   * 不能引用闭包变量、模块导入或任何转译器辅助函数，入参只能走 `args`。
   */
  evaluate<A extends readonly unknown[], R>(fn: (...args: A) => R, ...args: A): Promise<R> {
    return this.miniProgram.evaluate(fn, ...args) as Promise<R>;
  }

  private async readFailedPhase(): Promise<string | undefined> {
    const blocked = await this.page.$(`.${PHASE_CLASS.blocked}`);
    if (blocked) return `运行时不满足要求: ${await this.operationText()}`;
    const failed = await this.page.$(`.${PHASE_CLASS.error}`);
    if (failed) return `初始化失败: ${await this.operationText()}`;
    return undefined;
  }

  private async readCapability(row: MiniProgramElement): Promise<CapabilityReading> {
    const name = await textOf(row, '.capability-name');
    const ok = await row.$('.capability-ok');
    const status = ok ?? (await row.$('.capability-failed'));
    if (!status) throw new Error(`能力行「${name}」没有状态列`);
    return { name, status: (await status.text()).trim() };
  }

  private async readCheck(row: MiniProgramElement): Promise<CheckReading> {
    return {
      name: await textOf(row, '.check-name'),
      detail: await textOf(row, '.check-detail'),
      status: await textOf(row, '.check-status')
    };
  }

  private async tap(selector: string): Promise<void> {
    const element = await this.page.$(selector);
    if (!element) throw new Error(`没找到可点击元素: ${selector}`);
    await element.tap();
  }

  /**
   * 等状态栏出现预期文案。
   *
   * 页面上每个操作结束都会改写状态栏，用它当完成信号比固定 sleep 稳，
   * 也比轮询列表长度准——删到 0 条和还没开始删，列表长度是分不出来的。
   */
  private async waitForOperation(expected: string): Promise<void> {
    const deadline = Date.now() + OPERATION_TIMEOUT_MS;
    let last = '';
    while (Date.now() < deadline) {
      last = await this.operationText();
      if (last === expected) return;
      await delay(POLL_INTERVAL_MS);
    }
    throw new Error(`等待状态「${expected}」超时，最后停在「${last}」`);
  }
}
