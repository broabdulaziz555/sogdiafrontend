'use client';

import { useMemo, useState } from 'react';
import { Gift, KeyRound, ShieldCheck, UserCog } from 'lucide-react';
import { errMsg, post } from '@/lib/api';
import { dateTime, fmtUsd, shortAddr } from '@/lib/format';
import { revalidatePath } from '@/lib/mutate';
import type { Account, Role, User } from '@/lib/types';
import { useApi } from '@/hooks/useApi';
import { PageHead } from '@/components/dashboard/PageHead';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer, Modal } from '@/components/ui/Modal';
import { Badge, CopyButton, Segmented, Select, StatusBadge } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { KV, ReasonDialog, Section, XTag, useAction, useDebounced, useIsX } from './AdminKit';
import { GiftModal } from './GiftModal';

const KYC_FILTERS = [{ value: '', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'verified', label: 'Verified' }, { value: 'rejected', label: 'Rejected' }, { value: 'not_submitted', label: 'None' }];

interface UsersRes { users: User[]; total: number }
type Row = User & { accounts_count?: number };

function ImpersonateResult({ data, onClose }: { data: { user: { email: string }; action_link: string; expires_in: number } | null; onClose: () => void }) {
  return (
    <Modal open={!!data} onClose={onClose} size="md" title="Impersonation link" description={data ? `One-time sign-in link for ${data.user.email}. Expires in ${Math.round(data.expires_in / 60)} min.` : undefined}
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      {data && (
        <div className="space-y-3 p-5 text-sm">
          <p className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-warn">Open this link in a <b>private window</b>. Using it in this browser would replace your staff session. The action is audited.</p>
          <div className="flex items-center gap-2 rounded-md border border-line bg-panel2 p-2"><code className="num min-w-0 flex-1 truncate font-mono text-xs">{data.action_link}</code><CopyButton value={data.action_link} /></div>
        </div>
      )}
    </Modal>
  );
}

function UserDrawer({ user, onClose, onChanged }: { user: Row | null; onClose: () => void; onChanged: () => void }) {
  const isX = useIsX();
  const toast = useToast();
  const { busy, run } = useAction();
  const [dlg, setDlg] = useState<null | 'reject' | 'role' | 'kyc' | 'gift'>(null);
  const [role, setRole] = useState<Role>('trader');
  const [kyc, setKyc] = useState('verified');
  const [imp, setImp] = useState<{ user: { email: string }; action_link: string; expires_in: number } | null>(null);

  const accts = useApi<{ accounts: Account[]; total: number }>(user ? '/admin/accounts' : null, user ? { user_id: user.id, limit: 20 } : undefined);

  if (!user) return null;
  const done = () => { onChanged(); void revalidatePath('/admin/users'); };

  return (
    <>
      <Drawer open={!!user} onClose={onClose} title={user.full_name || user.email} subtitle={<span className="flex items-center gap-2"><Badge tone={user.role === 'trader' ? 'neutral' : user.role === 'xdepartment' ? 'warn' : 'accent'}>{user.role}</Badge><span className="truncate">{user.email}</span></span>} width="max-w-lg">
        <div className="space-y-5 p-5">
          <dl className="divide-y divide-line rounded-xl border border-line bg-panel px-4">
            <KV k="User ID" v={<span className="inline-flex items-center gap-1.5">{user.id.slice(0, 8)}…<CopyButton value={user.id} /></span>} mono />
            <KV k="KYC" v={<StatusBadge status={user.kyc_status} />} />
            {user.kyc_note && <KV k="KYC note" v={user.kyc_note} />}
            <KV k="Country" v={user.country || '—'} />
            <KV k="Wallet" v={user.wallet_address ? <span className="inline-flex items-center gap-1.5" title={user.wallet_address}>{shortAddr(user.wallet_address)}<CopyButton value={user.wallet_address} /></span> : '—'} mono />
            <KV k="Joined" v={dateTime(user.created_at)} />
          </dl>

          <Section title="Accounts" actions={<span className="num text-xs text-muted">{accts.data?.total ?? '—'}</span>}>
            {accts.isLoading && !accts.data ? <div className="space-y-2 p-4"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
              : accts.error ? <p className="p-4 text-sm text-down">Couldn’t load accounts.</p>
              : !accts.data?.accounts.length ? <p className="p-4 text-sm text-muted">This user has no accounts.</p>
              : <ul className="divide-y divide-line">{accts.data.accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0"><span className="font-medium">{a.type === 'instant' ? 'Instant' : 'One-Step'} {fmtUsd(a.size).replace(/\.00$/, '')}</span>{a.is_gifted && <Badge tone="info" className="ml-2">gift</Badge>}<span className="block truncate font-mono text-2xs text-subtle">{a.id}</span></span>
                    <span className="flex shrink-0 items-center gap-3"><span className="num font-mono text-xs">{fmtUsd(a.equity)}</span><StatusBadge status={a.status} /></span>
                  </li>))}</ul>}
          </Section>

          <Section title="Actions">
            <div className="flex flex-wrap gap-2 p-4">
              {user.kyc_status === 'pending' && (<>
                <Button size="sm" variant="up" loading={busy === 'approve'} onClick={() => run('approve', async () => { await post(`/admin/kyc/${user.id}`, { action: 'approve' }); done(); }, 'KYC approved')}>Approve KYC</Button>
                <Button size="sm" variant="danger" onClick={() => setDlg('reject')}>Reject KYC</Button>
              </>)}
              {isX ? (<>
                <Button size="sm" variant="secondary" icon={<Gift className="h-3.5 w-3.5" />} onClick={() => setDlg('gift')}>Gift accounts <XTag /></Button>
                <Button size="sm" variant="secondary" icon={<UserCog className="h-3.5 w-3.5" />} onClick={() => { setRole(user.role); setDlg('role'); }}>Change role <XTag /></Button>
                <Button size="sm" variant="secondary" icon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={() => setDlg('kyc')}>Force KYC <XTag /></Button>
                <Button size="sm" variant="secondary" icon={<KeyRound className="h-3.5 w-3.5" />} loading={busy === 'imp'} onClick={() => run('imp', async () => { setImp(await post(`/xdepartment/impersonate/${user.id}`)); })}>Impersonate <XTag /></Button>
              </>) : <p className="w-full text-xs text-subtle">Role changes, gifts, forced KYC and impersonation are limited to the X-Department tier.</p>}
            </div>
          </Section>
        </div>
      </Drawer>

      <ReasonDialog open={dlg === 'reject'} onClose={() => setDlg(null)} title="Reject KYC" description={user.email} confirmLabel="Reject" tone="down" label="Note for the trader" placeholder="e.g. Document unreadable — please re-upload"
        onConfirm={async (note) => { await post(`/admin/kyc/${user.id}`, { action: 'reject', note }); toast.success('KYC rejected'); done(); }} />

      <ReasonDialog open={dlg === 'role'} onClose={() => setDlg(null)} title="Change role" description={user.email} confirmLabel="Set role"
        onConfirm={async (reason) => { await post(`/xdepartment/users/${user.id}/role`, { role, reason }); toast.success(`Role set to ${role}`); done(); }}>
        <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="trader">trader</option><option value="admin">admin</option><option value="xdepartment">xdepartment</option></Select>
        {role === 'xdepartment' && <p className="text-2xs text-warn">X-Department can gift, adjust, delete and edit platform settings. Grant sparingly.</p>}
      </ReasonDialog>

      <ReasonDialog open={dlg === 'kyc'} onClose={() => setDlg(null)} title="Force KYC state" description="Bypasses the review flow." confirmLabel="Apply" label="Note"
        onConfirm={async (note) => { await post(`/xdepartment/users/${user.id}/kyc`, { kyc_status: kyc, note }); toast.success(`KYC set to ${kyc}`); done(); }}>
        <Select aria-label="KYC status" value={kyc} onChange={(e) => setKyc(e.target.value)}><option value="verified">verified</option><option value="pending">pending</option><option value="rejected">rejected</option><option value="not_submitted">not_submitted</option></Select>
      </ReasonDialog>

      <GiftModal open={dlg === 'gift'} onClose={() => setDlg(null)} recipient={{ id: user.id, email: user.email }} />
      <ImpersonateResult data={imp} onClose={() => setImp(null)} />
    </>
  );
}

export function UsersPanel() {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [q, setQ] = useState('');
  const [kyc, setKyc] = useState('');
  const [sel, setSel] = useState<Row | null>(null);
  const dq = useDebounced(q);
  const { data, error, isLoading, mutate } = useApi<UsersRes>('/admin/users', { query: dq || undefined, kyc_status: kyc || undefined, limit: size, offset: page * size });

  const cols: Column<Row>[] = useMemo(() => [
    { key: 'email', header: 'User', sortValue: (u) => u.email, cell: (u) => <span className="block min-w-0"><span className="block truncate font-medium">{u.full_name || u.email}</span>{u.full_name && <span className="block truncate text-xs text-muted">{u.email}</span>}</span> },
    { key: 'role', header: 'Role', sortValue: (u) => u.role, hideBelow: 'sm', cell: (u) => <Badge tone={u.role === 'trader' ? 'neutral' : u.role === 'xdepartment' ? 'warn' : 'accent'}>{u.role}</Badge> },
    { key: 'kyc', header: 'KYC', sortValue: (u) => u.kyc_status, cell: (u) => <StatusBadge status={u.kyc_status} /> },
    { key: 'accounts', header: 'Accounts', align: 'right', hideBelow: 'md', sortValue: (u) => u.accounts_count ?? 0, cell: (u) => <span className="num font-mono">{u.accounts_count ?? 0}</span> },
    { key: 'country', header: 'Country', hideBelow: 'lg', sortValue: (u) => u.country, cell: (u) => u.country || <span className="text-subtle">—</span> },
    { key: 'joined', header: 'Joined', align: 'right', hideBelow: 'md', sortValue: (u) => Date.parse(u.created_at), cell: (u) => <span className="num text-xs text-muted">{dateTime(u.created_at)}</span> },
  ], []);

  return (
    <>
      <PageHead title="Users" subtitle="Search by email or name. Click a row to review, act on KYC or manage the user." />
      <DataTable<Row>
        columns={cols} rows={data?.users} rowKey={(u) => u.id} loading={isLoading && !data} error={error && !data ? error : undefined} onRetry={() => void mutate()}
        onRowClick={setSel} activeRowKey={sel?.id} searchPlaceholder="Search email or name" pageSizes={[25, 50, 100]}
        server={{ total: data?.total ?? 0, page, pageSize: size, onPageChange: setPage, onPageSizeChange: (n) => { setSize(n); setPage(0); }, query: q, onQueryChange: (v) => { setQ(v); setPage(0); } }}
        toolbar={<Segmented value={kyc} onChange={(v) => { setKyc(v); setPage(0); }} options={KYC_FILTERS} size="sm" ariaLabel="KYC filter" />}
        empty={{ title: 'No users match', description: 'Try a different search or clear the KYC filter.' }}
      />
      <UserDrawer user={sel} onClose={() => setSel(null)} onChanged={() => { void mutate(); setSel(null); }} />
    </>
  );
}
