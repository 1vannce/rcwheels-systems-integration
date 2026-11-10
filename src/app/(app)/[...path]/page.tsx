import { notFound } from "next/navigation";

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
      <h1 className="text-2xl font-semibold">{planned.label}</h1>
      <p className="text-sm text-muted-foreground">
        This screen is built in a later phase of the project plan.
      </p>
    </>
  );
}
