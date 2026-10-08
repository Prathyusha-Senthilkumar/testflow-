import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/app/_ui/PageSkeleton";
import { SearchPage } from "@/views/SearchPage";

export const metadata: Metadata = { title: "Search" };

export default function Page() {
  // SearchPage reads the URL query (useSearchParams), which needs a Suspense boundary.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SearchPage />
    </Suspense>
  );
}
