import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCart } from '@/features/cart/store';
import { fetchMerchantPage } from '@/features/discover/api';
import { orderModes } from '@/features/merchant/modes';
import { confirmAsync } from '@/lib/confirm';
import { errorKey } from '@/lib/errors';

import type { CustomerOrder } from './api';
import { rebuildLines } from './reorder';
import { reportHasNews, useReorderReport } from './reorderReport';

/**
 * « Recommander » : reconstitue un panier à partir d'une ancienne commande (historique ou détail).
 * Aucun paiement ni envoi : le client relit son panier, qui montre ce qui n'a pas pu être repris.
 * Les horaires, le retrait et la livraison sont revérifiés au moment de recommander, et les prix
 * sont ceux d'aujourd'hui (une promotion passée n'est jamais reprise).
 */
export function useReorder() {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reorder = async (order: CustomerOrder) => {
    if (!order.merchants) return;
    setMessage(null);
    setBusyId(order.id);
    try {
      const page = await fetchMerchantPage(order.merchants.slug);
      if (!page) {
        setMessage(t('client.order.reorderNothing'));
        return;
      }
      const { lines, issues } = rebuildLines(order.order_items, page.menu);
      if (lines.length === 0) {
        useReorderReport.getState().setReport(null);
        setMessage(t('client.order.reorderNothing'));
        return;
      }
      const cart = useCart.getState();
      const target = { id: page.merchant.id, slug: page.merchant.slug, name: page.merchant.name };
      if (cart.merchant && cart.merchant.id !== target.id && cart.lines.length > 0) {
        const replace = await confirmAsync({
          title: t('client.cart.replaceTitle'),
          message: t('client.cart.replaceBody', { name: cart.merchant.name }),
          confirmLabel: t('client.cart.replaceAction'),
          cancelLabel: t('common.cancel'),
        });
        if (!replace) return;
      }
      lines.forEach((line, i) => cart.add(target, line, { replace: i === 0 }));

      // Mode de commande : celui de la commande d'origine s'il est encore proposé, sinon le premier proposé.
      const modes = orderModes(page.merchant);
      const wanted = order.fulfillment === 'delivery' ? 'delivery' : 'pickup';
      const mode = modes.includes(wanted) ? wanted : (modes[0] ?? wanted);
      useCart.getState().setFulfillment(mode);

      const report = {
        merchantName: page.merchant.name,
        issues,
        unavailableNow: !page.merchant.is_accepting_orders,
        modeChangedFrom: mode !== wanted ? wanted : null,
      } as const;
      useReorderReport.getState().setReport(reportHasNews(report) ? { ...report } : null);
      router.push('/cart');
    } catch (e) {
      setMessage(t(errorKey(e)));
    } finally {
      setBusyId(null);
    }
  };

  return { reorder, busyId, message };
}
