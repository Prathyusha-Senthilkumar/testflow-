import { Suspense } from "react";
import { RunResultPage } from "@/views/RunResultPage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RunResultPage />
    </Suspense>
  );
}
