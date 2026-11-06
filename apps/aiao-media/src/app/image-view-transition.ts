let activeTransition: ViewTransition | null = null;

/** 在界面更新前后，把共享图片从源位置平滑移动到目标位置。 */
export async function transitionImage(
  source: HTMLImageElement | null,
  update: () => Promise<HTMLImageElement | null>
): Promise<void> {
  if (activeTransition) {
    activeTransition.skipTransition();
    await activeTransition.finished;
    await update();
    return;
  }
  if (!source || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await update();
    return;
  }
  const destination: { image: HTMLImageElement | null } = { image: null };
  source.style.viewTransitionName = 'template-image';
  document.documentElement.classList.add('template-image-transition');
  try {
    const transition = document.startViewTransition(async () => {
      source.style.removeProperty('view-transition-name');
      destination.image = await update();
      if (destination.image) destination.image.style.viewTransitionName = 'template-image';
    });
    activeTransition = transition;
    void transition.ready.catch(() => undefined);
    await transition.finished;
  } finally {
    source.style.removeProperty('view-transition-name');
    destination.image?.style.removeProperty('view-transition-name');
    document.documentElement.classList.remove('template-image-transition');
    activeTransition = null;
  }
}
