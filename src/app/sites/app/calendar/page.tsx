import type { Metadata } from 'next';
import { PnlCalendar } from '@/components/dashboard/PnlCalendar';

export const metadata: Metadata = { title: 'PnL Calendar' };

export default function CalendarPage() {
  return <PnlCalendar />;
}
