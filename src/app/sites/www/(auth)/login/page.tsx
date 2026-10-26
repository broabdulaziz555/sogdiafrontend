import type { Metadata } from 'next';
import { LoginForm } from '@/components/marketing/AuthForms';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: true } };

export default function LoginPage() {
  return <LoginForm />;
}
