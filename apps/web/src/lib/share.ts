// Android shares arrive as ?url= or ?text= (often a title plus the link), the iOS Shortcut as ?add=.
export function sharedUrl(search: string): string | undefined {
  const params = new URLSearchParams(search);
  for (const name of ['url', 'text', 'add']) {
    const match = params.get(name)?.match(/https?:\/\/\S+/);
    if (match) return match[0];
  }
  return undefined;
}
