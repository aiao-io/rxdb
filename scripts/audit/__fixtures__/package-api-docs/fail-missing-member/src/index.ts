import { ExternalBase } from '../../external.js';

/** A root export whose member contract is intentionally incomplete. */
export interface BrokenSettings {
  missing: string;
  /** A documented nested option group. */
  nested: {
    undocumentedNested: boolean;
  };
}

/** A root class whose member contract is intentionally incomplete. */
export class BrokenService extends ExternalBase {
  private privateMissing = false;
  protected protectedMissing = false;

  missing(): boolean {
    return this.privateMissing || this.protectedMissing;
  }
}
