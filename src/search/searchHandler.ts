import { gamblePool } from "../gamble/pool";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import { WindowMatcher } from "./windowMatcher";

export const PROGRESS_INTERVAL = 2 ** 21;

export function createSearchHandler(send: (response: WorkerResponse) => void): (request: WorkerRequest) => void {
  let matcher: WindowMatcher | null = null;

  return (request) => {
    try {
      if (request.type === "init") {
        const { charLevel, poolOrder, rowPool, observed } = request.params;
        matcher = new WindowMatcher(charLevel, gamblePool(poolOrder, rowPool), observed);
        send({ type: "ready" });
        return;
      }

      if (!matcher) throw new Error("The search worker got a scan before init.");
      for (let from = request.start; from < request.end; from += PROGRESS_INTERVAL) {
        const to = Math.min(request.end, from + PROGRESS_INTERVAL);
        matcher.scan(from, to, (storeSeed) => send({ type: "match", storeSeed }));
        send({ type: "progress", seeds: to - from });
      }
      send({ type: "done" });
    } catch (error) {
      send({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };
}
