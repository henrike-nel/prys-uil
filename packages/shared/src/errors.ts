// A short, user-facing reason for an error, e.g. "HTTP 403" or "timeout".
export function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error.name === 'TimeoutError') return 'timeout';
  return error.message.split('\n')[0] ?? error.message;
}
