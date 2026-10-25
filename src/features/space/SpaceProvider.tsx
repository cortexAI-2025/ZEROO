import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, use, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';

import { claimAccountSpace, fetchAccountSpace, type Space } from './api';

export type { Space } from './api';

type SpaceState = {
  space: Space | null;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  chooseSpace: (space: Space) => Promise<void>;
  selectSignUpSpace: (space: Space) => void;
  signUpSpace: Space | null;
};

const SpaceContext = createContext<SpaceState>({
  space: null,
  isLoading: true,
  error: null,
  refetch: () => {},
  chooseSpace: async () => {},
  selectSignUpSpace: () => {},
  signUpSpace: null,
});

/** L'espace appartient au compte. Aucune préférence locale ne donne accès à un autre métier. */
export function SpaceProvider({ children }: { children: ReactNode }) {
  const { session, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [signUpSpace, selectSignUpSpace] = useState<Space | null>(null);
  const key = ['account-space', session?.user.id];
  const query = useQuery({ queryKey: key, queryFn: fetchAccountSpace, enabled: !!session });
  const chooseSpace = async (next: Space) => {
    if (!session) throw new Error('not_authenticated');
    const claimed = await claimAccountSpace(next);
    queryClient.setQueryData(key, claimed);
  };
  return (
    <SpaceContext
      value={{
        space: session ? (query.data ?? null) : null,
        isLoading: authLoading || (!!session && query.isPending),
        error: session ? query.error : null,
        refetch: () => {
          void query.refetch();
        },
        chooseSpace,
        selectSignUpSpace,
        signUpSpace,
      }}>
      {children}
    </SpaceContext>
  );
}

export function useSpace() {
  return use(SpaceContext);
}

export function homeHref(space: Space | null) {
  if (space === 'client') return '/explore' as const;
  if (space === 'merchant') return '/pro' as const;
  if (space === 'courier') return '/livreur' as const;
  return '/choose-space' as const;
}
