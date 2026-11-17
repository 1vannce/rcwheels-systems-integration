import Link from "next/link";

import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <>
      <PageHeader
        title="You can't open that screen"
        description="Your role doesn't include it, and the attempt was recorded. If you need access, ask the system administrator to change your role."
      />
      <div>
        <Button render={<Link href="/dashboard" />}>Go to the dashboard</Button>
      </div>
    </>
  );
}
