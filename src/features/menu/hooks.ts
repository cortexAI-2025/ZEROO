import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchMenu } from './api';

export const menuKeys = {
  all: (merchantId: string) => ['menu', merchantId] as const,
};

export function useMenu(merchantId: string) {
  return useQuery({ queryKey: menuKeys.all(merchantId), queryFn: () => fetchMenu(merchantId) });
}

/** Mutation sur le menu : recharge le menu une fois terminée, en cas de succès comme d'échec. */
export function useMenuMutation<TArgs>(
  merchantId: string,
  mutationFn: (args: TArgs) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: menuKeys.all(merchantId) }),
  });
}
