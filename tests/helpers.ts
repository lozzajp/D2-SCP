export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}

export function randomInt(random: () => number, min: number, max: number): number {
  return min + (random() % (max - min + 1));
}
