import type { Metadata } from 'next';
import { KycPanel } from '@/components/dashboard/KycPanel';

export const metadata: Metadata = { title: 'Verification' };

export default function KycPage() {
  return <KycPanel />;
}
