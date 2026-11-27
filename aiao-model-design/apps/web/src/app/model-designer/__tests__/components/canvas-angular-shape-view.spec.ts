import { describe, expect, it } from 'vitest';
import { clearAngularShapeContainer } from '../../components/canvas/canvas-angular-content';

describe('clearAngularShapeContainer', () => {
  it('does not throw after X6 has already detached the Angular node container', () => {
    expect(() => clearAngularShapeContainer(undefined)).not.toThrow();
  });

  it('removes mounted Angular content from an existing node container', () => {
    const container = document.createElement('div');
    container.append(document.createElement('span'));

    clearAngularShapeContainer(container);

    expect(container.childElementCount).toBe(0);
  });
});
