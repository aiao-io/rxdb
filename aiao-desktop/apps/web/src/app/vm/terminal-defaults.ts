import { FINDER_DEFAULTS_DOMAIN, SHOW_ALL_FILES_KEY } from '../services/finder-preferences';
import type { TerminalCommandResponse } from './terminal-command';

const BOOLEANS = new Map([
  ['true', true],
  ['yes', true],
  ['false', false],
  ['no', false]
]);

/** 只接受写入 Finder 的 AppleShowAllFiles 布尔偏好。 */
export async function writeFinderDefaults(
  args: readonly string[],
  write: (shown: boolean) => Promise<void>
): Promise<TerminalCommandResponse> {
  const [command, domain, key, type, input] = args;
  const shown = BOOLEANS.get(input?.toLowerCase() ?? '');
  if (
    args.length !== 5 ||
    command !== 'write' ||
    domain !== FINDER_DEFAULTS_DOMAIN ||
    key !== SHOW_ALL_FILES_KEY ||
    (type !== '-bool' && type !== '-boolean') ||
    shown === undefined
  )
    return {
      exitCode: 64,
      stdout: '',
      stderr: `usage: defaults write ${FINDER_DEFAULTS_DOMAIN} ${SHOW_ALL_FILES_KEY} -bool {true|false}`
    };

  try {
    await write(shown);
    return { exitCode: 0, stdout: '', stderr: '' };
  } catch (error) {
    return { exitCode: 1, stdout: '', stderr: `defaults: ${error instanceof Error ? error.message : String(error)}` };
  }
}
