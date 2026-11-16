/** True only in a frontend explicitly built for this fork's self-hosted stack. */
export function isSelfHostAccess(): boolean {
  return typeof import.meta.env !== 'undefined' && import.meta.env.VITE_SELF_HOST_ACCESS === 'true';
}
