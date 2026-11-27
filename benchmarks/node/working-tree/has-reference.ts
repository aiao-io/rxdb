/**
 * bench-freeze workflow 的 regenerate 模式入口前检查：本机画像是否已有 reference。
 *
 * 输出 `yes` / `no` 后以 0 退出，供 shell 直接判定——把判定放在脚本里而不是在
 * YAML 里内联 `node -e`，避免引号地狱，也让这段逻辑能独立跑。
 *
 * @remarks
 * 只读 `REFERENCE_DIR` 与运行环境，没有任何落盘副作用。
 */

import { collectEnvironment, readReferences, selectReference } from './working-tree-gate.ts';
import { REFERENCE_DIR } from './working-tree-report.ts';

const references = await readReferences(REFERENCE_DIR);
const profile = collectEnvironment().ratioProfile;
console.log(selectReference(references, profile) === null ? 'no' : 'yes');
