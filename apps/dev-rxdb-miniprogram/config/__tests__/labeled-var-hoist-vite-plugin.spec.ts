import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { hoistLabeledVars, labeledVarHoistVitePlugin } from '../labeled-var-hoist-vite-plugin';

describe('hoistLabeledVars', () => {
  it('标签语句里的 var 在所在函数开头补一份无初值声明，原声明不动（React beginWork 的形状）', () => {
    const code = 'function f(k){switch(k){case 3:e:{var o=1;break e}return 1;case 5:return o=2}}';

    expect(hoistLabeledVars(code)).toBe(
      'function f(k){var o;switch(k){case 3:e:{var o=1;break e}return 1;case 5:return o=2}}'
    );
  });

  it('标签循环、嵌套标签、解构里的名字都收，每层函数各收各的', () => {
    const code = 'function a(){e:for(;;){var x=1,{y,z:[w,...r]}=q;break e}function b(){t:{u:{var v}}}}';

    expect(hoistLabeledVars(code)).toBe(
      'function a(){var x,y,w,r;e:for(;;){var x=1,{y,z:[w,...r]}=q;break e}function b(){var v;t:{u:{var v}}}}'
    );
  });

  it('插在 use strict 指令之后；程序顶层与块体箭头函数也补', () => {
    expect(hoistLabeledVars('"use strict";e:{var g}')).toBe('"use strict";var g;e:{var g}');
    expect(hoistLabeledVars('function f(){"use strict";e:{var a}}')).toBe('function f(){"use strict";var a;e:{var a}}');
    expect(hoistLabeledVars('const f=()=>{e:{var a}}')).toBe('const f=()=>{var a;e:{var a}}');
  });

  it('let、const 与标签外的 var 不动；没有要补的原样返回', () => {
    const code = 'function f(){var a;e:{let b;const c=1}if(a){var d}}';

    expect(hoistLabeledVars(code)).toBe(code);
  });

  it('补的声明不带初值，不改参数与已赋的值', () => {
    const hoisted = hoistLabeledVars('(function(o){e:{if(o===0){var o=1}}return o})("p")');

    expect(hoisted).toBe('(function(o){var o;e:{if(o===0){var o=1}}return o})("p")');
    expect(runInNewContext(hoisted)).toBe('p');
  });

  it('碰到 class static block 直接失败，不猜插入点', () => {
    expect(() => hoistLabeledVars('class A{static{e:{var a}}}')).toThrow(/static block/);
  });
});

interface FakeChunk {
  type: 'chunk';
  code: string;
}

describe('labeledVarHoistVitePlugin', () => {
  it('只在 build 生效，generateBundle 改写每个 chunk、不碰资源文件', () => {
    const plugin = labeledVarHoistVitePlugin();
    const bundle: Record<string, FakeChunk | { type: 'asset'; source: string }> = {
      'app.js': { type: 'chunk', code: 'e:{var a}' },
      'common.js': { type: 'chunk', code: 'exports.x=1;' },
      'app.acss': { type: 'asset', source: 'e:{var a}' }
    };
    const generateBundle = plugin.generateBundle as (this: unknown, options: unknown, bundle: unknown) => void;
    generateBundle.call({}, {}, bundle);

    expect(plugin.apply).toBe('build');
    expect(bundle).toEqual({
      'app.js': { type: 'chunk', code: 'var a;e:{var a}' },
      'common.js': { type: 'chunk', code: 'exports.x=1;' },
      'app.acss': { type: 'asset', source: 'e:{var a}' }
    });
  });
});
