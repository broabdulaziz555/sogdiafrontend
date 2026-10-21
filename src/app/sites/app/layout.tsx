import type { Metadata } from 'next';
import { AuthGate } from '@/components/ui/AuthGate';
import { DashShell } from '@/components/dashboard/DashShell';

export const metadata: Metadata = { title: { default: 'Dashboard', template: '%s · SOGDIA' }, robots: { index: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <DashShell>{children}</DashShell>
    </AuthGate>
  );
}
