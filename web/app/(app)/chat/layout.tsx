import type { ReactNode } from 'react';

/** Chat fills the pane. Conversation history sits in the app sidebar. */
export default function ChatLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}
