/** Same convention as backend: runner config lives beside the Playwright script. */
export function scriptToRunnerConfigPath(scriptPath: string): string {
  const normalized = scriptPath.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  const dir = slash >= 0 ? normalized.slice(0, slash) : "";
  return dir ? `${dir}/data.json` : "data.json";
}
