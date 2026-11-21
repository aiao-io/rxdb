import { describe, expect, it } from 'vitest';

import { dragClipPath } from './web-app-drag';

describe('集成应用的拖动层形状', () => {
  it('矩形减去挖空：挖空换算成相对拖动区左上角的坐标，按 evenodd 挖掉', () => {
    expect(
      dragClipPath({
        x: 10,
        y: 0,
        width: 100,
        height: 36,
        holes: [
          { x: 20, y: 4, width: 28, height: 28 },
          { x: 80, y: 6, width: 24, height: 24 }
        ]
      })
    ).toBe("path(evenodd, 'M0 0H100V36H0Z M10 4H38V32H10Z M70 6H94V30H70Z')");
  });

  it('没有挖空时整块可拖', () => {
    expect(dragClipPath({ x: 0, y: 0, width: 640, height: 38, holes: [] })).toBe("path(evenodd, 'M0 0H640V38H0Z')");
  });
});
