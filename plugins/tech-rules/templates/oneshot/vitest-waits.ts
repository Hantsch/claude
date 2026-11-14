import { vi } from "vitest";

// vi.waitFor and vi.waitUntil give up after 1 s unless told otherwise: a hidden speed limit that a
// loaded machine misses while the code is fine. Every wait gets one generous budget instead; the
// central test timeout stays the hang detector. A call that names its own timeout keeps it.
//
// Wire it in the Vitest config, next to testTimeout and hookTimeout:
//   setupFiles: ["<path to this file>"],
//   expect: { poll: { timeout: 10_000 } },   // the same budget for expect.poll
//
// And keep it live with a guard test - counted, not timed (at one try per 50 ms the 1 s default
// ends after about 20 tries):
//   let tries = 0;
//   await vi.waitFor(() => expect(++tries).toBeGreaterThan(25));
export const WAIT_TIMEOUT_MS = 10_000;

type WaitOptions = Parameters<typeof vi.waitFor>[1];

/** The options a wait runs with: the central budget unless the call sets a timeout. */
export function withCentralWait(options?: WaitOptions): WaitOptions {
  if (typeof options === "number") return options;
  return { timeout: WAIT_TIMEOUT_MS, ...options };
}

const waitFor = vi.waitFor.bind(vi);
const waitUntil = vi.waitUntil.bind(vi);
vi.waitFor = ((callback, options) => waitFor(callback, withCentralWait(options))) as typeof vi.waitFor;
vi.waitUntil = ((callback, options) => waitUntil(callback, withCentralWait(options))) as typeof vi.waitUntil;
