import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GeneratorPage } from './generator';
import { GENERATOR_DEMOS } from './generator-state';

/**
 * @fileoverview 生成器页的产物与下载闸门（与 Angular / Vue 同口径）：内置的两个示例都要能生成，
 * 输入无效时显示错误、不留旧产物、不能下载。
 */

vi.mock('../hooks/useTheme', () => ({ useTheme: () => ({ currentThemeLightDark: 'light' }) }));

// CodeMirror 在 happy-dom 里只渲染可视区的行，读不全产物：换成直接显示 value 的桩
vi.mock('@aiao/code-editor-react', () => ({
  CodeEditor: ({
    value,
    onChange,
    readonly
  }: {
    value: string;
    onChange?: (value: string) => void;
    readonly?: boolean;
  }) =>
    readonly ?
      <pre data-testid='generator-output-text'>{value}</pre>
    : <textarea aria-label='JSON 输入' value={value} onChange={event => onChange?.(event.target.value)} />
}));

const downloadButton = (): HTMLButtonElement => screen.getByTestId<HTMLButtonElement>('generator-download');
const outputText = (): string => screen.queryByTestId('generator-output-text')?.textContent ?? '';
const typeJson = (value: string): void => {
  fireEvent.change(screen.getByLabelText('JSON 输入'), { target: { value } });
};

describe('GeneratorPage', () => {
  it('Menu 示例经树生成器产出树查询方法，可以下载', () => {
    render(<GeneratorPage />);

    fireEvent.click(screen.getByRole('tab', { name: 'Menu' }));

    expect(outputText()).toContain('findDescendants');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(downloadButton().disabled).toBe(false);
  });

  it('输入无效时显示错误、清掉旧产物且不能下载；改回有效输入后恢复', () => {
    render(<GeneratorPage />);
    expect(outputText()).toContain('class Todo');

    typeJson('{ invalid json');

    expect(screen.getByRole('alert').textContent).not.toBe('');
    expect(outputText()).toBe('');
    expect(downloadButton().disabled).toBe(true);

    typeJson(JSON.stringify(GENERATOR_DEMOS[0], null, 2));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(outputText()).toContain('class Todo');
    expect(downloadButton().disabled).toBe(false);
  });

  it('清空输入时没有产物，也不能下载空包', () => {
    render(<GeneratorPage />);

    typeJson('');

    expect(screen.queryByRole('alert')).toBeNull();
    expect(outputText()).toBe('');
    expect(downloadButton().disabled).toBe(true);
  });
});
