/** 类：声明处同时是类型和值（`both`）。 */
export class Widget {
  id = '';
}

/** 另一个类，作为对照组：入口以值形式转出，应保持 `both`。 */
export class Sprocket {
  id = '';
}

/** 第三个类，用于逐 specifier 的 `export { type X }` 形式。 */
export class Gadget {
  id = '';
}

/** 纯类型：无论怎么转都是 `type`。 */
export interface WidgetOptions {
  strict: boolean;
}

/** 纯值。 */
export const VERSION = '1.0.0';
