import type { Metadata } from 'next';
import { PayoutsPanel } from '@/components/dashboard/PayoutsPanel';

export const metadata: Metadata = { title: 'Payouts' };

export default function Page() {
  return <PayoutsPanel />;
}
