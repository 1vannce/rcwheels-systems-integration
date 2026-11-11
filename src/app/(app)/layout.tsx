import { Suspense } from "react";
import { connection } from "next/server";

import {
  countUnreadNotifications,
  getNavigationForRole,
  requireUser,
} from "@/modules/core";
import { AppShell } from "@/modules/core/components/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // The session is read at request time, so the signed-in frame streams in.
    <Suspense
      fallback={<p className="p-6 text-sm text-muted-foreground">Loading…</p>}
    >
      <SignedInShell>{children}</SignedInShell>
    </Suspense>
  );
}

async function SignedInShell({ children }: { children: React.ReactNode }) {
  await connection();
  const user = await requireUser();
  const unreadCount = await countUnreadNotifications(user);

  return (
    <AppShell
      user={user}
      navigation={getNavigationForRole(user.role)}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
