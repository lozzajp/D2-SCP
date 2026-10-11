import patternsUrl from "../data/lk_hell_p7.bin?url";
import { ChestPatterns } from "./patterns";

let loading: Promise<ChestPatterns> | undefined;

export function loadChestPatterns(): Promise<ChestPatterns> {
  loading ??= fetch(patternsUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`Couldn't load chest patterns (${response.status}).`);
      return response.arrayBuffer();
    })
    .then((buffer) => new ChestPatterns(new Uint8Array(buffer)))
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  return loading;
}
