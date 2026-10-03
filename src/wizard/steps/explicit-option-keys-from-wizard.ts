/**
 * Which option keys count as "explicit" for a completed interactive run:
 * a real CLI flag given up front, or a spec actually prompted for and
 * answered live — never a key only present because `licenseImpliedAnswers`
 * injected it alongside a real answer.
 *
 * @param flagsGiven - Option values already supplied via CLI flags.
 * @param answeredKeys - Keys `Wizard` actually prompted for and answered.
 * @returns The deduped union of both.
 */
export function explicitOptionKeysFromWizard(
  flagsGiven: Record<string, unknown>,
  answeredKeys: string[],
): string[] {
  return [...new Set([...Object.keys(flagsGiven), ...answeredKeys])];
}
