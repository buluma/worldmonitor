type LiveMediaStarter = () => void;
const starters = new Map<string, LiveMediaStarter>();

export function registerLiveMediaStarter(panelId: string, start: LiveMediaStarter): void {
  starters.set(panelId, start);
}

export function unregisterLiveMediaStarter(panelId: string, start?: LiveMediaStarter): void {
  if (start && starters.get(panelId) !== start) return;
  starters.delete(panelId);
}

export function playAllLiveMedia(): void {
  for (const start of Array.from(starters.values())) start();
}
