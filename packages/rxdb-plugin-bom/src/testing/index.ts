/**
 * @fileoverview BOM 测试与演示数据（US-525）：SC-100 确定性种子与手写 golden 表
 *
 * demo 与 vitest 用例共用同一份数据；golden 全部手写、不由被测 kernel 生成。
 */

export {
  BOM_VIEW_FIXTURE_DATES,
  loadBomViewFixture,
  type BomViewFixture,
  type BomViewFixtureActions,
  type BomViewFixtureIds,
  type BomViewFixtureRoot
} from './bom-view-fixture.js';
export { COPRODUCT_DATASET, COPRODUCT_GOLDEN, loadCoproductDataset } from './coproduct-dataset.js';
export {
  SCOOTER_DATASET,
  SCOOTER_DATASET_D,
  SCOOTER_DATASET_E,
  SCOOTER_DATASET_F,
  SCOOTER_SEED_BATCH_NO,
  SCOOTER_SEED_ROW_COUNTS,
  SCOOTER_SEED_TIMESTAMP,
  deterministicId,
  loadScooterDataset,
  loadScooterDatasetC,
  loadScooterDatasetD,
  loadScooterDatasetE,
  loadScooterDatasetF,
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
