const RATE_WINDOW_MS = 4000;

export class RateMeter {
  private readonly samples: { time: number; count: number }[] = [];

  update(count: number): number {
    const now = performance.now();
    this.samples.push({ time: now, count });
    while (this.samples.length > 2 && now - this.samples[0].time > RATE_WINDOW_MS) this.samples.shift();
    const oldest = this.samples[0];
    return now > oldest.time ? ((count - oldest.count) / (now - oldest.time)) * 1000 : 0;
  }
}
