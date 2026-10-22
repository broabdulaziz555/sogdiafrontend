'use client';

import { ThemeProvider } from 'next-themes';
import { SWRConfig } from 'swr';
import { ToastProvider } from '@/components/ui/Toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} themes={['light', 'dark']} disableTransitionOnChange>
      <SWRConfig value={{ dedupingInterval: 1500, keepPreviousData: true }}>
        <ToastProvider>{children}</ToastProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
