import { ExternalBase } from '../../external.js';

/** A documented public configuration. */
export interface PublicConfig {
  /** A documented scalar option. */
  value: string;
  /** A documented nested option group. */
  nested: {
    /** A documented nested option. */
    retries: number;
  };
}

/** A documented public service. */
export class PublicService extends ExternalBase {
  #privateField = false;
  private privateMissing = false;
  protected protectedMissing = false;

  /** Create a public service. */
  constructor() {
    super();
  }

  /** Execute the service. */
  execute(): boolean {
    return this.#privateField || this.privateMissing || this.protectedMissing;
  }
}
