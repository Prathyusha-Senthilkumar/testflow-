import { ServerOff } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";

const DEFAULT_MESSAGE = "No test runners are online right now. Tests you start will wait in the queue until a runner is available.";

/** No runners checked in yet, or runner status isn't available on this server. */
export function WorkersEmpty({ message, unavailable = false }: { message?: string | null; unavailable?: boolean }) {
  return (
    <EmptyState
      variant="panel"
      icon={ServerOff}
      title={unavailable ? "Runner status isn’t available yet." : "No test runners online"}
      description={unavailable ? "Tests you start still run as usual. Runners will appear here once status reporting is available." : message || DEFAULT_MESSAGE}
    />
  );
}
