import type { EnvironmentSummary } from "@/lib/api";

/** The project's default environment: the flagged one, else the oldest (lists come oldest first). */
export function defaultEnvironment(environments: EnvironmentSummary[]): EnvironmentSummary | undefined {
  return environments.find((env) => env.isDefault) ?? environments[0];
}
