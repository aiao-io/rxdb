import type { RuleGroup } from '@aiao/rxdb';
import { useI18n, useI18nRuntime } from '@aiao/rxdb-i18n-react';
import { useQueryBuilder } from '@aiao/rxdb-model-react/headless';
import {
  getInputType,
  isRuleGroup,
  type FieldMetadata,
  type QueryBuilderController,
  type QueryBuilderRule,
  type QueryBuilderRuleGroup
} from '@aiao/rxdb-model/headless';
import { defaultRuleValue, operatorLabel, operatorsFor, queryFields, ruleValueFromText } from './article-model';

function RuleRow({
  rule,
  controller,
  fields
}: {
  rule: QueryBuilderRule;
  controller: QueryBuilderController;
  fields: readonly FieldMetadata[];
}): React.JSX.Element {
  const i18n = useI18nRuntime();
  const { t } = useI18n();
  const field = fields.find(item => item.name === rule.field);
  const operators = operatorsFor(field);
  const inputType = getInputType(field?.type ?? 'string', rule.operator, field?.enum);
  const valueText = String(rule.value ?? '');

  const changeField = (name: string): void => {
    const next = fields.find(item => item.name === name);
    const operator = operatorsFor(next)[0]?.key ?? '=';
    controller.updateRule(rule.id, { field: name, operator, value: defaultRuleValue(next, operator) });
  };

  let valueControl: React.JSX.Element | null = null;
  if (inputType === 'enum') {
    valueControl = (
      <select
        aria-label={t('page.headless.value')}
        value={valueText}
        onChange={event => controller.updateRule(rule.id, { value: event.target.value })}
      >
        <option value=''>{t('page.headless.pleaseSelect')}</option>
        {(field?.enum ?? []).map(option => (
          <option key={String(option)} value={String(option)}>
            {String(option)}
          </option>
        ))}
      </select>
    );
  } else if (inputType !== 'none') {
    valueControl = (
      <input
        aria-label={t('page.headless.value')}
        inputMode={inputType === 'number' ? 'numeric' : undefined}
        value={valueText}
        onChange={event => controller.updateRule(rule.id, { value: ruleValueFromText(inputType, event.target.value) })}
      />
    );
  }

  return (
    <div className='hl-rule' data-testid='qb-rule'>
      <select aria-label={t('page.headless.field')} value={rule.field} onChange={event => changeField(event.target.value)}>
        <option value=''>{t('page.headless.selectField')}</option>
        {fields.map(item => (
          <option key={item.name} value={item.name}>
            {item.displayName}
          </option>
        ))}
      </select>
      <select
        aria-label={t('page.headless.operator')}
        value={rule.operator}
        onChange={event =>
          controller.updateRule(rule.id, {
            operator: event.target.value,
            value: defaultRuleValue(field, event.target.value)
          })
        }
      >
        {operators.map(operator => (
          <option key={operator.key} value={operator.key}>
            {operatorLabel(operator, i18n)}
          </option>
        ))}
      </select>
      {valueControl}
      <button type='button' aria-label={t('page.headless.deleteRule')} onClick={() => controller.remove(rule.id)}>
        {t('common.delete')}
      </button>
    </div>
  );
}

function GroupView({
  group,
  controller,
  fields,
  isRoot
}: {
  group: QueryBuilderRuleGroup;
  controller: QueryBuilderController;
  fields: readonly FieldMetadata[];
  isRoot: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div
      className='hl-group'
      role='group'
      aria-label={isRoot ? t('page.headless.filterRoot') : t('page.headless.filterGroup')}
      data-testid='qb-group'
    >
      <div className='hl-group-head'>
        <select
          aria-label={t('page.headless.combinator')}
          value={group.combinator}
          onChange={event => controller.updateGroupCombinator(group.id, event.target.value as 'and' | 'or')}
        >
          <option value='and'>{t('page.headless.combinatorAnd')}</option>
          <option value='or'>{t('page.headless.combinatorOr')}</option>
        </select>
        <button
          type='button'
          onClick={() =>
            controller.addRule(group.id, { field: fields[0]?.name, operator: operatorsFor(fields[0])[0]?.key })
          }
        >
          {t('page.headless.addRule')}
        </button>
        <button type='button' onClick={() => controller.addGroup(group.id)}>
          {t('page.headless.addGroup')}
        </button>
        {!isRoot && (
          <button type='button' aria-label={t('page.headless.deleteGroup')} onClick={() => controller.remove(group.id)}>
            {t('page.headless.deleteGroup')}
          </button>
        )}
      </div>
      <ul className='hl-group-body'>
        {group.rules.map(item => (
          <li key={item.id}>
            {isRuleGroup(item) ?
              <GroupView group={item} controller={controller} fields={fields} isRoot={false} />
            : <RuleRow rule={item} controller={controller} fields={fields} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 筛选面板：自有的分组 / 规则行 / 控件，状态与动作来自 `useQueryBuilder`；文案用应用的 i18n 运行时。 */
export function QueryPanel({ onApply }: { onApply(query: RuleGroup): void }): React.JSX.Element {
  const i18n = useI18nRuntime();
  // 订阅语言变化：切换语言时规则行里的操作符文案随之重新渲染
  const { t } = useI18n();
  const { controller, snapshot } = useQueryBuilder({ fields: queryFields, i18n });
  const errors = snapshot.validation.errors ?? [];

  return (
    <section className='hl-section' aria-labelledby='hl-query-title' data-testid='headless-query'>
      <h2 id='hl-query-title'>{t('page.headless.queryTitle')}</h2>
      <GroupView group={snapshot.state.rootGroup} controller={controller} fields={snapshot.fields} isRoot />
      {errors.length > 0 && (
        <ul className='hl-error' role='alert' data-testid='qb-errors'>
          {errors.map((error, index) => (
            <li key={`${error.field}-${index}`}>{error.message}</li>
          ))}
        </ul>
      )}
      <div className='hl-actions'>
        <button type='button' disabled={!snapshot.valid} onClick={() => onApply(controller.toRxDBQuery())}>
          {t('page.headless.applyFilter')}
        </button>
        <button
          type='button'
          onClick={() => {
            controller.clear();
            onApply(controller.toRxDBQuery());
          }}
        >
          {t('page.headless.clearFilter')}
        </button>
      </div>
      <pre className='hl-output' aria-label={t('page.headless.queryOutput')} data-testid='qb-query'>
        {JSON.stringify(snapshot.query)}
      </pre>
    </section>
  );
}
