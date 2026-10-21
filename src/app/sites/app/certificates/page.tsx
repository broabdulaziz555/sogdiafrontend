import type { Metadata } from 'next';
import { CertificatesGallery } from '@/components/dashboard/CertificatesGallery';

export const metadata: Metadata = { title: 'Certificates' };

export default function Page() {
  return <CertificatesGallery />;
}
