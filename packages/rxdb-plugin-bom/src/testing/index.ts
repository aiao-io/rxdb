/**
 * @fileoverview BOM 测试与演示数据（US-525）：SC-100 确定性种子与手写 golden 表
 *
 * demo 与 vitest 用例共用同一份数据；golden 全部手写、不由被测 kernel 生成。
 */

export {
  deterministicId,
  loadScooterDataset,
  loadScooterDatasetC,
  SCOOTER_DATASET,
  SCOOTER_SEED_BATCH_NO,
  SCOOTER_SEED_TIMESTAMP,
  type ScooterDesignatorSpec,
  type ScooterHeaderSpec,
  type ScooterItemIds,
  type ScooterItemSpec,
  type ScooterOccurrenceSpec
} from './scooter-dataset.js';
export {
  SCOOTER_GOLDEN,
  goldenItemId,
  goldenOccurrenceId,
  type GoldenPenetration,
  type GoldenRequirement,
  type GoldenStepValue
} from './scooter-golden.js';
