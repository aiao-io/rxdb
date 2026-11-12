/** Clears Angular content when an X6 node container is still mounted. */
export function clearAngularShapeContainer(container: HTMLDivElement | undefined): void {
  container?.replaceChildren();
}
