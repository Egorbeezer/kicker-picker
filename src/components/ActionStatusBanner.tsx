import React from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  pendingStatus: string | null;
}

export const ActionStatusBanner: React.FC<Props> = ({ pendingStatus }) => {
  if (!pendingStatus) return null;
  return (
    <div
      data-testid="action-status-banner"
      className="fixed top-[calc(58px+var(--tg-inset-top,0px))] left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded-full bg-[var(--card)]/95 border border-[#2ea6ff]/40 shadow-lg flex items-center gap-2 text-xs font-semibold text-[var(--text)] pointer-events-none"
    >
      <Loader2 size={13} className="animate-spin text-[#2ea6ff] shrink-0" />
      <span>{pendingStatus}</span>
    </div>
  );
};
