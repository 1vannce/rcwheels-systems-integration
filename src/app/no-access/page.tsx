import { Button } from "@/components/ui/button";
import { signOutAction } from "@/modules/core/actions/auth.actions";

// Shown when a Supabase account is signed in but has no active RCWheels user.
export default function NoAccessPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-semibold">No access</h1>
        <p className="text-sm text-muted-foreground">
          This account is not an active RCWheels user. Ask the system
          administrator to set it up, then sign in again.
        </p>
        <form action={signOutAction}>
          <Button type="submit">Sign out</Button>
        </form>
      </div>
    </main>
  );
}
