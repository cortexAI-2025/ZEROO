import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import type { ProfileValues } from '@/features/auth/schemas';
import type { TablesInsert } from '@/types/database';

import {
  addAddress,
  deleteAddress,
  fetchAddresses,
  fetchFavoriteIds,
  fetchFavoriteMerchants,
  fetchProfile,
  setDefaultAddress,
  setFavorite,
  updateProfile,
} from './api';

export const accountKeys = {
  all: ['account'] as const,
  profile: (userId: string | undefined) => ['account', 'profile', userId] as const,
  addresses: (userId: string | undefined) => ['account', 'addresses', userId] as const,
  favoriteIds: (userId: string | undefined) => ['account', 'favorite-ids', userId] as const,
  favorites: (userId: string | undefined) => ['account', 'favorites', userId] as const,
};

function useUserId() {
  return useAuth().session?.user.id;
}

export function useProfile() {
  const userId = useUserId();
  return useQuery({
    queryKey: accountKeys.profile(userId),
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  });
}

export function useUpdateProfile() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ProfileValues) => updateProfile(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.profile(userId) }),
  });
}

export function useAddresses() {
  const userId = useUserId();
  return useQuery({
    queryKey: accountKeys.addresses(userId),
    queryFn: () => fetchAddresses(userId!),
    enabled: !!userId,
  });
}

export function useAddressActions() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const onSuccess = () =>
    queryClient.invalidateQueries({ queryKey: accountKeys.addresses(userId) });
  return {
    add: useMutation({
      mutationFn: (values: Omit<TablesInsert<'customer_addresses'>, 'user_id'>) =>
        addAddress({ ...values, user_id: userId! }),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: deleteAddress, onSuccess }),
    setDefault: useMutation({ mutationFn: setDefaultAddress, onSuccess }),
  };
}

export function useFavoriteIds() {
  const userId = useUserId();
  return useQuery({
    queryKey: accountKeys.favoriteIds(userId),
    queryFn: () => fetchFavoriteIds(userId!),
    enabled: !!userId,
  });
}

export function useFavoriteMerchants() {
  const userId = useUserId();
  return useQuery({
    queryKey: accountKeys.favorites(userId),
    queryFn: () => fetchFavoriteMerchants(userId!),
    enabled: !!userId,
  });
}

export function useToggleFavorite() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ merchantId, favorite }: { merchantId: string; favorite: boolean }) =>
      setFavorite(userId!, merchantId, favorite),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: accountKeys.favoriteIds(userId) });
      await queryClient.invalidateQueries({ queryKey: accountKeys.favorites(userId) });
    },
  });
}
