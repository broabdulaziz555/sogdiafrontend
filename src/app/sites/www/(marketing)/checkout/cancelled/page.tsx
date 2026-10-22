import type { Metadata } from 'next';
import { CheckoutCancelled } from '@/components/marketing/CheckoutResult';

export const metadata: Metadata = { title: 'Checkout cancelled', robots: { index: false } };

export default function Page() {
  return <CheckoutCancelled />;
}
