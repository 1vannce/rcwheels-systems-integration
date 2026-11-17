import { Button } from "@/components/ui/button";
import { signOutAction } from "@/modules/core/actions/auth.actions";

// Shown when a Supabase account is signed in but has no active RCWheels user.
export default function NoAccessPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border bg-card p-6">
        <h1 className="text-2xl font-semibold">This account has no RCWheels access</h1>
        <p className="text-sm text-muted-foreground">
          You signed in, but the account isn&apos;t set up as an active RCWheels user. Ask
          the system administrator to set it up, then sign in again.
        </p>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
