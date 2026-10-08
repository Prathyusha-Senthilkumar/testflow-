import type { Metadata } from "next";
import { WorkersPage } from "@/views/WorkersPage";

export const metadata: Metadata = { title: "Workers" };

export default function Page() {
  return <WorkersPage />;
}
