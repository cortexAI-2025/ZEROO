import { create } from 'zustand';

import type { OrderMode } from '@/features/merchant/modes';

import type { ReorderIssue } from './reorder';

/** Compte rendu de « Recommander », affiché une fois dans le panier puis fermé par le client. */
export type ReorderReport = {
  merchantName: string;
  issues: ReorderIssue[];
  /** L'établissement n'accepte pas de commande à cet instant (fermé, en pause…). */
  unavailableNow: boolean;
  /** Le mode de l'ancienne commande n'est plus proposé : celui du panier a changé. */
  modeChangedFrom: OrderMode | null;
};

type State = {
  report: ReorderReport | null;
  setReport: (report: ReorderReport | null) => void;
};

/** Non persisté : ce n'est qu'un message transitoire. */
export const useReorderReport = create<State>((set) => ({
  report: null,
  setReport: (report) => set({ report }),
}));

/** Le compte rendu mérite-t-il d'être montré ? */
export const reportHasNews = (r: ReorderReport) =>
  r.issues.length > 0 || r.unavailableNow || r.modeChangedFrom !== null;
