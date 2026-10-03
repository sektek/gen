const CANCEL_SIGNALS = ['SIGTERM', 'SIGHUP'] as const;

/**
 * Listens for the process signals that cancel the wizard.
 *
 * @param onSignal - Called with the signal received.
 * @returns A function that removes the listeners again.
 */
export function listenForCancelSignals(
  onSignal: (signal: NodeJS.Signals) => void,
): () => void {
  const listeners = CANCEL_SIGNALS.map(signal => {
    const listener = () => onSignal(signal);
    process.on(signal, listener);
    return [signal, listener] as const;
  });

  return () => {
    for (const [signal, listener] of listeners) {
      process.off(signal, listener);
    }
  };
}
