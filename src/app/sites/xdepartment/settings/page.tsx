import { AuthGate } from '@/components/ui/AuthGate';
import { SettingsEditor } from '@/components/admin/SettingsEditor';

export default function Page() {
  return (
    <AuthGate roles={['xdepartment']}>
      <SettingsEditor />
    </AuthGate>
  );
}
