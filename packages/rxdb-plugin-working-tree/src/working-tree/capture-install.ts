/**
 * @fileoverview 把捕获运行时装到一个本地适配器上——本包仅有的装载点。
 *
 * @remarks
 * 搬自核心的 `RxDB.installWorkingTreeCapture()`（epic-006 抽包之前）。核心侧只留下
 * {@link RxDBAdapterLocalBase.setWorkingTreeCaptureHook} 这个装卸口，一个捕获语义都不认识。
 */

import type { RxDB, RxDBAdapterLocalBase } from '@aiao/rxdb';
import { createWorkingTreeCaptureRuntime } from './capture-hook.js';

/**
 * 给一个本地适配器装上工作树捕获运行时。
 *
 * @param rxdb - 该适配器所属的数据库；只读它的 `entityManager` 与 `config`
 * @param adapter - 目标本地适配器
 *
 * @remarks
 * **不在这里判能力位。** 两个调用方对「已启用」的把握来源不同：插件的 `bootstrapExisting()`
 * 是刚读过能力行，{@link WorkingTreeManager.enable} 是刚把它翻成真且事务已提交。把判定塞进来
 * 就得让后者在自己刚写完的事务外面再读一次同一行，而那次读与它自己的写之间隔着一个别人
 * 可以插队的窗口。
 *
 * 之所以是一个具名函数而不是让两个调用方各写一行：四个实参必须逐字相同。分叉之后，
 * 某一端装出来的运行时会按另一份实体清单判「这张表属不属于版本化域」，而症状要到某张表的行
 * 开始被捕获成用户编辑时才显形。
 *
 * **域问的是这个适配器本人**（`physicalTableNames()`），不是别处按分隔符重拼的一份：折叠命名
 * 空间是写表那一方的规则，抄一份过来不会因为原件改了而报错，只会开始认不出某张受版本控制的表，
 * 于是 raw 写门禁对它静默放行。
 *
 * 幂等由 {@link RxDBAdapterLocalBase.setWorkingTreeCaptureHook} 负责：重复调用先卸后装，
 * 不会叠成两层转发。
 */
export const installWorkingTreeCapture = (rxdb: RxDB, adapter: RxDBAdapterLocalBase): void => {
  adapter.setWorkingTreeCaptureHook(
    createWorkingTreeCaptureRuntime(adapter, rxdb.entityManager, rxdb.config.entities, rxdb.entitySync)
  );
};
