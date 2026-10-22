'use client';

import { useState } from 'react';
import { Download, Share } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useInstall } from '@/lib/pwa';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

/** "Install app" entry for a user menu. Renders nothing when the app is already installed or can't be installed here. */
export function InstallApp({ className, label = 'Install app', onDone }: { className?: string; label?: string; onDone?: () => void }) {
  const { canInstall, installed, ios, android, install } = useInstall();
  const [help, setHelp] = useState(false);
  if (installed || (!canInstall && !ios && !android)) return null;

  return (
    <>
      <button role="menuitem" className={cn('flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-fg/[0.06]', className)}
        onClick={async () => { if (canInstall) { await install(); onDone?.(); } else setHelp(true); }}>
        <Download className="h-4 w-4 text-subtle" />{label}
      </button>
      <Modal open={help && !ios} onClose={() => { setHelp(false); onDone?.(); }} size="sm" title="Install on Android"
        footer={<Button variant="primary" onClick={() => { setHelp(false); onDone?.(); }}>Got it</Button>}>
        <ol className="list-decimal space-y-2 p-5 pl-9 text-sm text-muted">
          <li>Open this page in <b className="text-fg">Chrome</b> with <b className="text-fg">Desktop site turned off</b>.</li>
          <li>Tap the <b className="text-fg">⋮</b> menu at the top right.</li>
          <li>Choose <b className="text-fg">Install app</b> (or <b className="text-fg">Add to Home screen</b>), then <b className="text-fg">Install</b>.</li>
        </ol>
      </Modal>
      <Modal open={help && ios} onClose={() => { setHelp(false); onDone?.(); }} size="sm" title="Install on iPhone / iPad"
        footer={<Button variant="primary" onClick={() => { setHelp(false); onDone?.(); }}>Got it</Button>}>
        <ol className="list-decimal space-y-2 p-5 pl-9 text-sm text-muted">
          <li>Open this page in <b className="text-fg">Safari</b>.</li>
          <li>Tap the <Share className="mx-0.5 inline h-4 w-4 align-text-bottom text-fg" /> <b className="text-fg">Share</b> button.</li>
          <li>Choose <b className="text-fg">Add to Home Screen</b>, then <b className="text-fg">Add</b>.</li>
        </ol>
      </Modal>
    </>
  );
}
