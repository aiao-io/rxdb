import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AiValidationReportComponent } from '../../../components/ai/ai-validation-report.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../../i18n/translations';
import type { ValidationSuggestion } from '../../../types/ai-schemas';

/**
 * Class-level tests for AiValidationReportComponent.
 * JIT 模式不支持 signal inputs 的 DOM 绑定测试。
 */

function createComponent(overrides?: { suggestions?: ValidationSuggestion[] }) {
  return TestBed.runInInjectionContext(() => {
    const c = new AiValidationReportComponent();
    const summarySignal = signal('');
    const suggestionsSignal = signal<ValidationSuggestion[]>(overrides?.suggestions ?? []);
    Object.defineProperty(c, 'summary', { value: summarySignal, writable: false });
    Object.defineProperty(c, 'suggestions', { value: suggestionsSignal, writable: false });
    return { component: c, summarySignal, suggestionsSignal };
  });
}

const renameSuggestion: ValidationSuggestion = {
  dimension: 'naming',
  severity: 'warning',
  entityName: 'user_info',
  message: 'Use PascalCase',
  suggestedFix: { type: 'rename', details: { from: 'user_info', to: 'UserInfo' } }
};

const infoSuggestion: ValidationSuggestion = {
  dimension: 'completeness',
  severity: 'info',
  entityName: 'User',
  message: 'Add email',
  suggestedFix: { type: 'addProperty', details: { name: 'email', propertyType: 'string' } }
};

describe('AiValidationReportComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
    });
  });

  describe('items computed', () => {
    it('should map suggestions to items with pending status', () => {
      const { component } = createComponent({ suggestions: [renameSuggestion, infoSuggestion] });
      const items = component['items']();
      expect(items).toHaveLength(2);
      expect(items[0].status).toBe('pending');
      expect(items[1].status).toBe('pending');
    });

    it('should return empty array for no suggestions', () => {
      const { component } = createComponent();
      expect(component['items']()).toHaveLength(0);
    });
  });

  describe('onAdopt', () => {
    it('should emit adoptSuggestion and mark as adopted', () => {
      const { component } = createComponent({ suggestions: [renameSuggestion, infoSuggestion] });
      let emitted: ValidationSuggestion | undefined;
      component.adoptSuggestion.subscribe((s: ValidationSuggestion) => (emitted = s));

      component['onAdopt'](0);

      expect(emitted).toBe(renameSuggestion);
      expect(component['items']()[0].status).toBe('adopted');
      expect(component['items']()[1].status).toBe('pending');
    });

    it('should not emit for invalid index', () => {
      const { component } = createComponent({ suggestions: [renameSuggestion] });
      let emitted = false;
      component.adoptSuggestion.subscribe(() => (emitted = true));

      component['onAdopt'](99);

      expect(emitted).toBe(false);
    });
  });

  describe('onIgnore', () => {
    it('should emit ignoreSuggestion and mark as ignored', () => {
      const { component } = createComponent({ suggestions: [renameSuggestion] });
      let emitted: ValidationSuggestion | undefined;
      component.ignoreSuggestion.subscribe((s: ValidationSuggestion) => (emitted = s));

      component['onIgnore'](0);

      expect(emitted).toBe(renameSuggestion);
      expect(component['items']()[0].status).toBe('ignored');
    });
  });

  describe('severity helpers', () => {
    it('should return correct color for each severity', () => {
      const { component } = createComponent();
      expect(component['severityColor']({ severity: 'error' })).toContain('error');
      expect(component['severityColor']({ severity: 'warning' })).toContain('warning');
      expect(component['severityColor']({ severity: 'info' })).toContain('info');
    });

    it('should return correct border for each severity', () => {
      const { component } = createComponent();
      expect(component['severityBorder']({ severity: 'error' })).toContain('error');
      expect(component['severityBorder']({ severity: 'warning' })).toContain('warning');
      expect(component['severityBorder']({ severity: 'info' })).toContain('info');
    });
  });

  describe('dimensionIcon', () => {
    it('should return icon for known dimensions', () => {
      const { component } = createComponent();
      expect(component['dimensionIcon']('naming')).toBeTruthy();
      expect(component['dimensionIcon']('relationship')).toBeTruthy();
      expect(component['dimensionIcon']('index')).toBeTruthy();
      expect(component['dimensionIcon']('normalization')).toBeTruthy();
      expect(component['dimensionIcon']('completeness')).toBeTruthy();
    });

    it('should return fallback for unknown dimension', () => {
      const { component } = createComponent();
      expect(component['dimensionIcon']('unknown')).toBeTruthy();
    });
  });
});
