import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchCourierRating,
  fetchCourierReviews,
  fetchMerchantRatings,
  fetchMerchantReviews,
  fetchOrderReview,
  submitReview,
} from './api';

export const reviewKeys = {
  all: ['reviews'] as const,
  order: (orderId: string) => ['reviews', 'order', orderId] as const,
  ratings: (ids: string[]) => ['reviews', 'ratings', [...ids].sort().join(',')] as const,
  merchant: (merchantId: string) => ['reviews', 'merchant', merchantId] as const,
  courier: (courierId: string) => ['reviews', 'courier', courierId] as const,
  courierSummary: (courierId: string) => ['reviews', 'courier-summary', courierId] as const,
};

export function useOrderReview(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: reviewKeys.order(orderId),
    queryFn: () => fetchOrderReview(orderId),
    enabled,
  });
}

export function useSubmitReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitReview,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reviewKeys.all }),
  });
}

export function useMerchantRatings(merchantIds: string[]) {
  return useQuery({
    queryKey: reviewKeys.ratings(merchantIds),
    queryFn: () => fetchMerchantRatings(merchantIds),
    enabled: merchantIds.length > 0,
    staleTime: 5 * 60_000,
  });
}

export function useMerchantReviews(merchantId: string) {
  return useQuery({
    queryKey: reviewKeys.merchant(merchantId),
    queryFn: () => fetchMerchantReviews(merchantId),
  });
}

export function useCourierReviews(courierId: string) {
  return useQuery({
    queryKey: reviewKeys.courier(courierId),
    queryFn: () => fetchCourierReviews(courierId),
  });
}

export function useCourierRating(courierId: string) {
  return useQuery({
    queryKey: reviewKeys.courierSummary(courierId),
    queryFn: fetchCourierRating,
  });
}
