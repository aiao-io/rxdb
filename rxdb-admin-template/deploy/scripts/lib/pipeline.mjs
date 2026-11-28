/**
 * 发布流水线的执行器（ADMIN-US-217 AC#2）：按顺序执行步骤，任一步失败即停止，不再执行后面的步骤；已经生效的步骤登记的补偿动作
 * 按相反顺序执行（例如第 3 步已把新函数上线，就把上一份函数产物换回去），线上保持上一个发布。
 *
 * 失败注入：`failStep` 为 N 时，第 N 步在它的注入点（`context.checkpoint()`）抛错。各步骤把注入点放在「这一步的工作已经做完、
 * 结果还没被后面依赖」的位置；切换 current 的那一步放在 rename 之前（切换之后就已经是新版本上线，不再是「失败」）。
 */

/**
 * @typedef {object} StepContext
 * @property {() => Promise<void>} checkpoint 失败注入点：本步被指定失败时在这里抛错
 * @property {(name: string, undo: () => Promise<void>) => void} onRollback 登记补偿动作：之后任一步失败时执行
 * @property {(line: string) => void} log
 */
/**
 * @typedef {object} Step
 * @property {number} n 序号（从 1 开始，与运维手册一致）
 * @property {string} name
 * @property {(context: StepContext) => Promise<void>} run
 */
/**
 * @typedef {object} StepResult
 * @property {number} n
 * @property {string} name
 * @property {'ok' | 'failed' | 'skipped'} status
 * @property {number} durationMs
 * @property {string} [error]
 */

/** 注入的失败：与真实失败走同一条停止与补偿路径，消息里标明是注入的。 */
export class InjectedFailure extends Error {
  constructor(step) {
    super(`注入的失败：第 ${step} 步（ADMIN_DEPLOY_FAIL_STEP=${step}）`);
    this.name = 'InjectedFailure';
  }
}

/**
 * 解析失败注入的设置：没设为 null；设了就必须是 1～`steps` 之间的整数，写错时直接报错（不悄悄当成没设）。
 * @param {string | undefined} value
 * @param {number} steps
 */
export function parseFailStep(value, steps) {
  if (value === undefined || value === '') return null;
  const step = Number(value);
  if (!Number.isInteger(step) || step < 1 || step > steps)
    throw new Error(`ADMIN_DEPLOY_FAIL_STEP 必须是 1～${steps} 的整数`);
  return step;
}

/** 错误只留消息的第一行，且截断到 300 个字符：发布记录里不放堆栈与命令输出。 */
const summary = error => (error instanceof Error ? error.message : String(error)).split('\n')[0].slice(0, 300);

/**
 * 依次执行步骤。返回每一步的结果、失败的步骤（成功时为 null）与补偿动作的执行情况；不抛错，由调用方决定退出码。
 * @param {Step[]} steps
 * @param {{ failStep?: number | null, log?: (line: string) => void, now?: () => number }} [options]
 */
export async function runPipeline(steps, options = {}) {
  const log = options.log ?? (line => console.info(line));
  const now = options.now ?? (() => Date.now());
  /** @type {{ name: string, undo: () => Promise<void> }[]} */
  const rollbacks = [];
  /** @type {StepResult[]} */
  const results = [];
  let failed = null;
  for (const step of steps) {
    if (failed) {
      results.push({ n: step.n, name: step.name, status: 'skipped', durationMs: 0 });
      continue;
    }
    const started = now();
    let checked = false;
    const context = {
      checkpoint: async () => {
        checked = true;
        if (options.failStep === step.n) throw new InjectedFailure(step.n);
      },
      onRollback: (name, undo) => rollbacks.push({ name, undo }),
      log: line => log(`  [${step.n}/${steps.length} ${step.name}] ${line}`)
    };
    log(`▶ 第 ${step.n} 步：${step.name}`);
    try {
      await step.run(context);
      if (!checked) throw new Error(`第 ${step.n} 步没有经过失败注入点`);
      results.push({ n: step.n, name: step.name, status: 'ok', durationMs: now() - started });
    } catch (error) {
      failed = { n: step.n, name: step.name, error: summary(error), injected: error instanceof InjectedFailure };
      results.push({ n: step.n, name: step.name, status: 'failed', durationMs: now() - started, error: failed.error });
      log(`✖ 第 ${step.n} 步失败：${failed.error}`);
    }
  }
  const compensations = [];
  if (failed)
    for (const { name, undo } of rollbacks.reverse()) {
      try {
        await undo();
        compensations.push({ name, status: 'ok' });
        log(`↺ 已补偿：${name}`);
      } catch (error) {
        compensations.push({ name, status: 'failed', error: summary(error) });
        log(`✖ 补偿失败：${name}：${summary(error)}`);
      }
    }
  return { ok: failed === null, failed, steps: results, compensations };
}
