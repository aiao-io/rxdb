export interface CloseParticipant {
  id: string;
  dirty: boolean;
  save(): Promise<boolean>;
  discard?(): Promise<void>;
  destroy(): void;
}
export type CloseDecision = 'save' | 'discard' | 'cancel';

export async function prepareClose(
  participants: CloseParticipant[],
  decide: (participant: CloseParticipant) => Promise<CloseDecision>,
  commit: () => Promise<void> = async () => undefined
): Promise<boolean> {
  const discarded: CloseParticipant[] = [];
  for (const participant of participants) {
    if (!participant.dirty) continue;
    const decision = await decide(participant);
    if (decision === 'cancel') return false;
    if (decision === 'save' && !(await participant.save())) return false;
    if (decision === 'discard') discarded.push(participant);
  }
  for (const participant of discarded) await participant.discard?.();
  await commit();
  for (const participant of participants) participant.destroy();
  return true;
}
