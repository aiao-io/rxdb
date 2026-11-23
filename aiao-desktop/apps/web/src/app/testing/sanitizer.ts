import { ruleFor, type HtmlPolicy } from '../shared/html-sanitizer';

/**
 * 白名单不变量：把净化结果重新解析一遍，列出所有不在策略里的东西。
 * 空数组表示结果里只有白名单内的元素与属性，每个属性值再走一遍规则也不会变，且没有注释。
 * 需要 DOM（用例文件头写 `// @vitest-environment happy-dom`）。
 */
export function policyViolations(html: string, policy: HtmlPolicy): string[] {
  const { body } = new DOMParser().parseFromString(html, 'text/html');
  const problems: string[] = [];
  for (const element of body.querySelectorAll('*')) {
    const name = element.localName;
    if (!Object.hasOwn(policy.elements, name)) problems.push(`<${name}>`);
    for (const attribute of Object.hasOwn(policy.elements, name) ? element.attributes : []) {
      const rule = ruleFor(policy, name, attribute.name);
      if (!rule) problems.push(`<${name} ${attribute.name}>`);
      else if (rule(attribute.value) !== attribute.value)
        problems.push(`<${name} ${attribute.name}="${attribute.value}">`);
    }
  }
  if (body.innerHTML.includes('<!--')) problems.push('comment');
  return problems;
}
