/**
 * Thrown by `runWizard()` when the user quits the wizard before it completes.
 */
export class WizardCancelledError extends Error {
  /**
   * @param signal - The signal the cancellation corresponds to (`SIGINT` for ctrl+c).
   */
  constructor(readonly signal: NodeJS.Signals) {
    super(`Wizard cancelled (${signal})`);
    this.name = 'WizardCancelledError';
  }
}
