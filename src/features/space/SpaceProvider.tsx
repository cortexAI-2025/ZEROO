import { createContext, type ReactNode, use, useState } from 'react';

/** Un même compte peut commander (client), gérer son commerce (merchant) ou livrer (courier). */
export type Space = 'client' | 'merchant' | 'courier';

const SPACES: readonly Space[] = ['client', 'merchant', 'courier'];

const STORAGE_KEY = 'zeroo.space';

function readStoredSpace(): Space | null {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return SPACES.includes(value as Space) ? (value as Space) : null;
  } catch {
    return null;
  }
}

type SpaceState = {
  space: Space | null;
  setSpace: (space: Space | null) => void;
};

const SpaceContext = createContext<SpaceState>({ space: null, setSpace: () => {} });

/** Mémorise sur l'appareil le dernier espace utilisé (préférence locale, rien côté serveur). */
export function SpaceProvider({ children }: { children: ReactNode }) {
  const [space, setSpaceState] = useState<Space | null>(readStoredSpace);

  const setSpace = (next: Space | null) => {
    setSpaceState(next);
    try {
      if (next) globalThis.localStorage?.setItem(STORAGE_KEY, next);
      else globalThis.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      // Stockage indisponible : la préférence reste en mémoire pour la session.
    }
  };

  return <SpaceContext value={{ space, setSpace }}>{children}</SpaceContext>;
}

export function useSpace() {
  return use(SpaceContext);
}

/** Écran d'accueil d'un utilisateur connecté, selon l'espace choisi. */
export function homeHref(space: Space | null) {
  if (space === 'client') return '/explore' as const;
  if (space === 'merchant') return '/pro' as const;
  if (space === 'courier') return '/livreur' as const;
  return '/choose-space' as const;
}
