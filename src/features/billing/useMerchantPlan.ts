import { useBilling } from './billing';
import { effectivePlan, merchantHasFeature, type MerchantFeature } from './entitlements';

/** Formule en vigueur de l'établissement (null sans abonnement en essai ou actif). */
export function useMerchantPlan(merchantId: string) {
  const billing = useBilling({ role: 'merchant', id: merchantId });
  const plan = effectivePlan(billing.data?.subscription);
  return {
    plan,
    isLoading: billing.isPending,
    has: (feature: MerchantFeature) => merchantHasFeature(plan, feature),
  };
}
