'use client';

import { Component, type ReactNode } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface Props { children: ReactNode; label?: string; compact?: boolean }
interface State { error: Error | null }

/** Panel-level error boundary: one broken widget must never take down the whole workspace. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary:${this.props.label ?? 'panel'}]`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex h-full min-h-[120px] flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="grid h-10 w-10 place-items-center rounded-lg border border-down/30 bg-down/10 text-down">
          <AlertOctagon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium">{this.props.label ?? 'This panel'} crashed</p>
          <p className="mx-auto mt-1 max-w-xs break-words font-mono text-2xs text-subtle">{this.state.error.message}</p>
        </div>
        <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => this.setState({ error: null })}>
          Reload panel
        </Button>
      </div>
    );
  }
}
