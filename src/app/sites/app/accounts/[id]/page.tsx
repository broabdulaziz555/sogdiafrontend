import { AccountDetail } from '@/components/dashboard/AccountDetail';

export default function AccountDetailPage({ params }: { params: { id: string } }) {
  return <AccountDetail id={params.id} />;
}
