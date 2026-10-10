// Web : pas de notifications push (le tableau de bord commerçant sonne déjà en direct).
export type PushStatus = 'unsupported' | 'undetermined' | 'granted' | 'denied';

export async function getPushStatus(): Promise<PushStatus> {
  return 'unsupported';
}

export async function registerForPush(_options: { ask: boolean }): Promise<PushStatus> {
  return 'unsupported';
}

export async function unregisterPush() {}

export function addNotificationTapListener(_open: (url: string) => void) {
  return () => {};
}
