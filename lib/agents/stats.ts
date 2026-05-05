// Lightweight statistics — no scipy, no heavy deps. Used by the Tier 1
// analysis layers to compute baselines + correlations.

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return Math.sqrt(acc / (xs.length - 1));
}

export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx;
    const b = y[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

// Bootstrap 95% CI for Pearson correlation. 1k iters with replacement.
// Returns [low, high] (5th and 95th percentile).
export function bootstrapCorrelationCI(
  x: number[],
  y: number[],
  iterations = 1000,
): [number, number] {
  const n = x.length;
  if (n < 5) return [-1, 1];
  const samples: number[] = new Array(iterations);
  for (let it = 0; it < iterations; it++) {
    const xs: number[] = new Array(n);
    const ys: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * n);
      xs[i] = x[idx];
      ys[i] = y[idx];
    }
    samples[it] = pearson(xs, ys);
  }
  samples.sort((a, b) => a - b);
  return [
    samples[Math.floor(iterations * 0.05)],
    samples[Math.floor(iterations * 0.95)],
  ];
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round(
    (startOfDay(b).getTime() - startOfDay(a).getTime()) / (24 * 3600 * 1000),
  );
}
