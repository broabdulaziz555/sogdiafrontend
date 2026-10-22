import type { Metadata } from 'next';
import { CheckoutSuccess } from '@/components/marketing/CheckoutResult';

export const metadata: Metadata = { title: 'Payment', robots: { index: false } };

export default function Page() {
  return <CheckoutSuccess />;
}
