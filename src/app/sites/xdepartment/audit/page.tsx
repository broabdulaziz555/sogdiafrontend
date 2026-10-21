import { AuthGate } from '@/components/ui/AuthGate';
import { AuditPanel } from '@/components/admin/AuditPanel';

export default function Page() {
  return (
    <AuthGate roles={['xdepartment']}>
      <AuditPanel />
    </AuthGate>
  );
}
