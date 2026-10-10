import { useEffect, useState } from 'react';

import { getPushStatus, type PushStatus, registerForPush } from './push';

/**
 * État des notifications sur cet appareil. Si l'utilisateur les a déjà autorisées,
 * l'appareil est (ré)enregistré en silence ; sinon `enable()` affiche la demande.
 */
export function usePush() {
  const [status, setStatus] = useState<PushStatus | null>(null);

  useEffect(() => {
    let active = true;
    void getPushStatus().then(async (current) => {
      const next =
        current === 'granted'
          ? await registerForPush({ ask: false }).catch(() => current)
          : current;
      if (active) setStatus(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const enable = async () => setStatus(await registerForPush({ ask: true }));
  return { status, enable };
}
