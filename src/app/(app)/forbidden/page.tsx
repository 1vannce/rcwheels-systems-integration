import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Not allowed</h1>
      <p className="text-sm text-muted-foreground">
        Your role cannot open that screen. The attempt was recorded.
      </p>
      <Link href="/dashboard" className="text-sm underline underline-offset-4">
        Back to the dashboard
      </Link>
    </>
  );
}
