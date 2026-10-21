import type { Side } from '@/lib/types';

/** Imperative handles the order ticket registers so global hotkeys can drive it. */
export const ticketApi: {
  submit?: (side: Side) => void;
  cycleType?: () => void;
  focusMargin?: () => void;
} = {};
