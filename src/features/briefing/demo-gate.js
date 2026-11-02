// Compile-time development gate: no demo module or fixture in a production build.
export function demoRequested({ dev, enabled, search }) {
  return dev === true && enabled === "true" && new URLSearchParams(search).get("demo") === "briefing";
}
