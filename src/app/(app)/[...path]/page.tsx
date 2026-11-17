import { notFound } from "next/navigation";

import PageHeader from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { findScreenByPath, requireScreen } from "@/modules/core";

// Stands in for screens whose phase is not built yet. The role check is the
// real one, so each role can already reach only its own screens.
export default async function PlannedScreenPage({ params }: PageProps<"/[...path]">) {
  const { path } = await params;
  const planned = findScreenByPath(`/${path.join("/")}`);

  if (!planned) {
    notFound();
  }

  await requireScreen(planned.screen);

  return (
    <>
      <PageHeader title={planned.label} />
      <EmptyState
        title="This screen isn't built yet"
        description="It arrives in a later phase of the project plan. Your role will be able to use it here once it's ready."
      />
    </>
  );
}
