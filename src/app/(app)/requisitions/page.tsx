import { redirect } from "next/navigation";

// The list lives under its own segment now; keep the old path working.
export default function RequisitionsPage() {
  redirect("/requisitions/my-requests");
}
