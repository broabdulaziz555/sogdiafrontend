import type { Metadata } from 'next';
import { ReferralsPanel } from '@/components/dashboard/ReferralsPanel';

export const metadata: Metadata = { title: 'Referrals' };

export default function Page() {
  return <ReferralsPanel />;
}
