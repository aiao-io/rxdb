/** 判环递归 CTE 的深度硬上限；触顶即拒绝，避免把无法完成的判定当成无环。 */
export const BOM_CYCLE_DEPTH_LIMIT = 128;
