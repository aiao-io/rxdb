/**
 * @fileoverview 能力认领水位：谁把这个库变成了「需要某个插件才能安全打开」的库。
 *
 * @remarks
 * 一个系统能力一旦在某个库上启用，就会在库里留下只有该能力认得的表与写路径约定。
 * 危险的不是这些表本身，而是**下一个打开这个库的客户端没装那个插件**：表照样在，
 * 写原语却一层拦截都没有，于是用户编辑安静地绕过该能力的簿记，两边数据分叉。
 *
 * 这件事没有任何编译期形态——缺的是一个包，不是一个符号。所以它必须在连接时按数据实测，
 * 而数据就是这里的水位行。
 *
 * **复用 `rxdb_migration` 表**而不是新开一张：能力认领与迁移水位是同一类事实
 * （「这个库上已经发生过什么」），共用那条唯一索引就直接得到了幂等与并发仲裁；
 * 新开表则要自己再造一遍，还得先有一次迁移才能把表建出来——而守卫恰恰要在迁移之前跑。
 *
 * 行名形如 `__rxdb_capability__:workingTree:1:@aiao/rxdb-plugin-working-tree`。
 * 第三段是**包说明符**，由插件自己写进去；守卫据此产出可直接执行的报错
 * （`pnpm add <包名>`），于是第三方插件不需要核心认识它就能给出一样有用的提示。
 */

/**
 * 能力认领水位行的名字前缀
 *
 * @remarks
 * 与 `RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX` / `RXDB_CHANGE_CODEC_WATERMARK_PREFIX` 互不重叠，
 * 因此 `readWatermarkVersion()` 读不到这些行、`runMigrations()` 的已执行名字集合也不会与它们撞名。
 */
export const RXDB_CAPABILITY_WATERMARK_PREFIX = '__rxdb_capability__:' as const;

/** 一次能力认领：谁（`packageSpecifier`）在这个库上启用了哪个能力（`capability`）的哪一版。 */
export interface RxDBCapabilityClaim {
  /** 能力名，与贡献它的插件的 `IRxDBPlugin.name` 同值 */
  readonly capability: string;

  /** 能力版本，正整数；比对由认领方自己负责（核心只管「有没有人认领」） */
  readonly version: number;

  /** 包说明符，如 `@aiao/rxdb-plugin-working-tree`；未认领时原样报给用户 */
  readonly packageSpecifier: string;
}

/** 带前缀、但读不出三元组的水位行。 */
export class MalformedRxDBCapabilityWatermarkError extends Error {
  override readonly name = 'MalformedRxDBCapabilityWatermarkError';

  constructor(
    readonly watermarkName: string,
    reason: string
  ) {
    super(`Malformed RxDB capability watermark "${watermarkName}": ${reason}`);
  }
}

/** 库里有能力行、本进程却没有任何插件认领它。 */
export class UnclaimedRxDBCapabilityError extends Error {
  override readonly name = 'UnclaimedRxDBCapabilityError';

  constructor(readonly claims: readonly RxDBCapabilityClaim[]) {
    super(
      '这个数据库启用了当前进程未认领的 RxDB 能力，缺少对应插件时写入不受该能力管辖，因此拒绝连接：\n' +
        claims.map(claim => `  - ${claim.capability} v${claim.version} —— 安装 ${claim.packageSpecifier}`).join('\n')
    );
  }
}

/**
 * 把一次能力认领编码成迁移行名
 *
 * @param claim - 能力、版本与包说明符
 * @returns `rxdb_migration."name"` 的行名
 */
export function capabilityWatermarkName(claim: RxDBCapabilityClaim): string {
  return `${RXDB_CAPABILITY_WATERMARK_PREFIX}${claim.capability}:${claim.version}:${claim.packageSpecifier}`;
}

/**
 * 从迁移行名里读回能力认领
 *
 * @param name - `rxdb_migration."name"` 的一行
 * @returns 不带能力前缀时为 `undefined`
 * @throws {@link MalformedRxDBCapabilityWatermarkError} 带前缀但三段读不出来时
 *
 * @remarks
 * 只切前两个 `:`，第三段整体保留——包说明符里合法地含 `:`（`https://host:8443/x`、
 * `npm:@scope/name` 都是），切碎了就报不出那个能把库救回来的名字。
 *
 * 带前缀却读不懂时**抛错而不是返回 `undefined`**：后者会把「新版本写的新格式」降级成
 * 「不认识，跳过」，而跳过正是这道守卫存在的唯一失败形态。
 */
export function parseCapabilityWatermark(name: string): RxDBCapabilityClaim | undefined {
  if (!name.startsWith(RXDB_CAPABILITY_WATERMARK_PREFIX)) return undefined;

  const body = name.slice(RXDB_CAPABILITY_WATERMARK_PREFIX.length);
  const capabilityEnd = body.indexOf(':');
  const versionEnd = capabilityEnd === -1 ? -1 : body.indexOf(':', capabilityEnd + 1);
  if (versionEnd === -1) {
    throw new MalformedRxDBCapabilityWatermarkError(name, 'expected <capability>:<version>:<packageSpecifier>');
  }

  const capability = body.slice(0, capabilityEnd);
  const version = Number(body.slice(capabilityEnd + 1, versionEnd));
  const packageSpecifier = body.slice(versionEnd + 1);

  if (!capability) throw new MalformedRxDBCapabilityWatermarkError(name, 'capability is empty');
  if (!packageSpecifier) throw new MalformedRxDBCapabilityWatermarkError(name, 'package specifier is empty');
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new MalformedRxDBCapabilityWatermarkError(name, 'version is not a positive integer');
  }

  return { capability, version, packageSpecifier };
}

/**
 * 未认领能力守卫
 *
 * @param migrationNames - 库里 `rxdb_migration` 的全部行名
 * @param claimedCapabilities - 本进程已注册的能力名
 * @throws {@link UnclaimedRxDBCapabilityError} 存在无人认领的能力时
 *
 * @remarks
 * 只按**能力名**判定认领与否；版本不等归认领方自己的 fail-closed（插件比核心更清楚自己
 * 能不能读旧版的表）。核心若也插一脚版本比对，插件每加一版就要等核心跟着放行。
 *
 * 同一能力的多条版本行只报最高的那一条：升级过的库会留下 v1、v2 两行，逐行报会让用户
 * 以为缺两个包。
 */
export function assertClaimedCapabilities(
  migrationNames: readonly string[],
  claimedCapabilities: ReadonlySet<string>
): void {
  const unclaimed = new Map<string, RxDBCapabilityClaim>();

  for (const name of migrationNames) {
    const claim = parseCapabilityWatermark(name);
    if (!claim || claimedCapabilities.has(claim.capability)) continue;

    const seen = unclaimed.get(claim.capability);
    if (!seen || seen.version < claim.version) unclaimed.set(claim.capability, claim);
  }

  if (unclaimed.size > 0) throw new UnclaimedRxDBCapabilityError([...unclaimed.values()]);
}
