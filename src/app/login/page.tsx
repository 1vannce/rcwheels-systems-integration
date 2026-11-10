import type { Metadata } from "next";

import { LoginForm } from "@/modules/core/components/login-form";

export const metadata: Metadata = { title: "Sign in | RCWheels" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">RCWheels</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with the account your administrator gave you.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
