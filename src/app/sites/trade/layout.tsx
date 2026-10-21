import type { Metadata } from 'next';
import { AuthGate } from '@/components/ui/AuthGate';

export const metadata: Metadata = { title: { default: 'Terminal', template: '%s · SOGDIA Terminal' }, robots: { index: false, follow: false } };

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
