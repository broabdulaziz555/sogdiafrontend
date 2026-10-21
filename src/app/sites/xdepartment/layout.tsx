import type { Metadata } from 'next';
import { AuthGate } from '@/components/ui/AuthGate';
import { AdminShell } from '@/components/admin/AdminShell';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · SOGDIA Admin' }, robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate roles={['admin', 'xdepartment']}>
      <AdminShell>{children}</AdminShell>
    </AuthGate>
  );
}
