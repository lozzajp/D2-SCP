import lowerKurastP1 from "../data/lk_hell_p1.bin?url";
import lowerKurastP3 from "../data/lk_hell_p3.bin?url";
import lowerKurastP5 from "../data/lk_hell_p5.bin?url";
import lowerKurastP7 from "../data/lk_hell_p7.bin?url";
import riverOfFlameP1 from "../data/rof_hell_p1.bin?url";
import riverOfFlameP3 from "../data/rof_hell_p3.bin?url";
import riverOfFlameP5 from "../data/rof_hell_p5.bin?url";
import riverOfFlameP7 from "../data/rof_hell_p7.bin?url";
import { tableKey, type PatternTable } from "./areas";
import { ChestPatterns } from "./patterns";

const URLS: Record<string, string> = {
  "lowerKurast-p1": lowerKurastP1,
  "lowerKurast-p3": lowerKurastP3,
  "lowerKurast-p5": lowerKurastP5,
  "lowerKurast-p7": lowerKurastP7,
  "riverOfFlame-p1": riverOfFlameP1,
  "riverOfFlame-p3": riverOfFlameP3,
  "riverOfFlame-p5": riverOfFlameP5,
  "riverOfFlame-p7": riverOfFlameP7,
};

const loading = new Map<string, Promise<ChestPatterns>>();

export function loadChestPatterns(table: PatternTable): Promise<ChestPatterns> {
  const key = tableKey(table);
  let promise = loading.get(key);
  if (!promise) {
    const url = URLS[key];
    promise = (url ? fetch(url) : Promise.reject(new Error(`No chest patterns for ${key}.`)))
      .then((response) => {
        if (!response.ok) throw new Error(`Couldn't load chest patterns (${response.status}).`);
        return response.arrayBuffer();
      })
      .then((buffer) => new ChestPatterns(new Uint8Array(buffer)))
      .catch((error: unknown) => {
        loading.delete(key);
        throw error;
      });
    loading.set(key, promise);
  }
  return promise;
}
