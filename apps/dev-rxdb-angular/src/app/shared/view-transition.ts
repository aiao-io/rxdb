export type ViewTransitionStarter = (
  update: () => void | Promise<void>
) => Pick<ViewTransition, 'updateCallbackDone' | 'finished'>;

export async function runViewTransition(
  update: () => void | Promise<void>,
  startTransition?: ViewTransitionStarter
): Promise<void> {
  if (!startTransition) {
    await update();
    return;
  }

  const transition = startTransition(update);
  await transition.updateCallbackDone;
  await transition.finished;
}
