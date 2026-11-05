export type RandomSource = number | (() => number);
export type RandomSnapshot = {
  scope: string;
  state: number;
  bags: Record<string, string[]>;
};

// xorshift32: the seed determines a reproducible sequence in [0, 1).
// System entropy is used only for the initial seed, never to select questions.
export class SeededRandom {
  state: number;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x6d2b79f5;
  }

  next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x100000000;
  }
}

function copyBags(bags: RandomSnapshot["bags"]): RandomSnapshot["bags"] {
  return Object.fromEntries(Object.entries(bags).map(([key, items]) => [key, [...items]]));
}

// Each category is shuffled once and exhausted before refilling. State belongs
// to the generated question, so retries, React re-renders and stale advance
// actions cannot consume future draws or change an existing preview.
export class BalancedSampler {
  private readonly rng: SeededRandom;
  private readonly bags: RandomSnapshot["bags"];
  private readonly scope: string;
  private readonly override?: () => number;

  constructor(scope: string, previous?: RandomSnapshot, source?: RandomSource) {
    const saved = previous?.scope === scope ? previous : undefined;
    const seed = saved?.state ?? (typeof source === "number" ? source
      : typeof source === "function" ? 1 : crypto.getRandomValues(new Uint32Array(1))[0]);
    this.scope = scope;
    this.rng = new SeededRandom(seed);
    this.bags = saved ? copyBags(saved.bags) : {};
    this.override = typeof source === "function" ? source : undefined;
  }

  take(key: string, choices: readonly string[], avoid?: string): string {
    if (!choices.length) throw new Error("Cannot draw from an empty question bag");
    let bag = this.bags[key];
    if (!bag?.length) {
      bag = [...choices];
      // Forward Fisher–Yates shuffle; a zero-valued test source preserves order.
      for (let index = 0; index < bag.length - 1; index++) {
        const value = this.override ? this.override() : this.rng.next();
        const other = index + Math.min(bag.length - index - 1, Math.floor(value * (bag.length - index)));
        [bag[index], bag[other]] = [bag[other], bag[index]];
      }
      this.bags[key] = bag;
    }
    // At a round boundary, draw another item first rather than dropping the
    // repeated item: the completed round still contains every choice once.
    const index = Math.max(0, bag.findIndex(item => item !== avoid));
    return bag.splice(index, 1)[0];
  }

  snapshot(): RandomSnapshot {
    return { scope: this.scope, state: this.rng.state, bags: copyBags(this.bags) };
  }
}
