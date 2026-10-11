import type { WorkerRequest, WorkerResponse } from "./protocol";
import { createSearchHandler } from "./searchHandler";

const handle = createSearchHandler((response: WorkerResponse) => postMessage(response));

addEventListener("message", (event: MessageEvent<WorkerRequest>) => handle(event.data));
