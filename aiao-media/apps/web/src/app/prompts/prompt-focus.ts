/** Template application may render before the user focuses a parameter. Check
 * at the actual focus boundary, not when scheduling, so delayed focus never
 * steals an in-progress native input / IME session inside the editor.
 */
export function schedulePromptFocus(host: HTMLElement, active: () => boolean, focus: () => void): void {
  requestAnimationFrame(() => {
    if (host.isConnected && active() && !host.contains(document.activeElement)) focus();
  });
}
