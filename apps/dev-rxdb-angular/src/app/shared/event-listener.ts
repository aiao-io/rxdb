export function listen(
  target: EventTarget,
  type: string,
  listener: EventListener,
  options?: AddEventListenerOptions
): () => void {
  target.addEventListener(type, listener, options);
  return () => target.removeEventListener(type, listener, options);
}
