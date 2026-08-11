import { capitalize } from './capitalize.js';
import { kebabCase } from './kebabCase.js';

/**
 * @example
 * startCase('--foo-bar'); // => 'Foo Bar'
 * startCase('fooBar'); // => 'Foo Bar'
 * startCase('__foo_bar__'); // => 'Foo Bar'
 */
export const startCase = (value: string): string => {
  return kebabCase(value)
    .split('-')
    .filter(c => !!c)
    .map(s => capitalize(s.toLowerCase()))
    .join(' ');
};
