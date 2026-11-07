/** 右键菜单的锚点：屏幕坐标与目标页签。 */
export interface TabMenuAnchor {
  /** 屏幕 X。 */
  readonly x: number;
  /** 屏幕 Y。 */
  readonly y: number;
  /** 目标页签键。 */
  readonly key: string;
}
