// The energy that paces the margin, as Ink & Memory had it: writing earns it,
// each note shown spends a fixed cost of it, and nothing else decides how
// often the margin speaks. Asking and showing are separate: a note may be
// fetched ahead and held until the writer has earned it, so it appears the
// moment the energy is there, not a model call later.

export interface PaceOptions {
  /** Energy one note costs. 50 is about 25 CJK characters or 50 letters. */
  cost?: number
  /**
   * Energy that must be earned between two asks. 0 asks at every finished clause, as the original did;
   * hosts where an ask is a whole agent turn set it to `cost` and ask for a few notes at once.
   */
  stride?: number
  /** How many notes one ask may bring back. */
  batch?: number
  /** After this many ms without typing the agent is asked for a nudge under the last line; false: never. */
  lull?: number | false
}

export interface Energy {
  cost: number
  earn(weight: number): void
  /** A page opened with notes on it: those were paid for, and the text is worth at least its weight. */
  restore(textWeight: number, shown: number): void
  canShow(): boolean
  /** A note was shown. */
  show(): void
  /** Called when a clause ends, with the number of notes fetched but not yet shown. */
  shouldAsk(held: number): boolean
  asked(): void
  /** How many notes the energy at hand would pay for, and how far along the next one is (0–1). */
  level(): number
  progress(): number
}

export function createEnergy({ cost = 50, stride = 0 }: PaceOptions = {}): Energy {
  let earned = 0
  let spent = 0
  let sinceAsk = 0
  // Something happened since the last ask that could change the answer: more text, or a note took its place.
  let fresh = false
  const unspent = () => Math.max(0, earned - spent)
  return {
    cost,
    earn(weight) {
      if (weight <= 0) return
      earned += weight
      sinceAsk += weight
      fresh = true
    },
    restore(textWeight, shown) {
      spent = shown * cost
      earned = Math.max(textWeight, spent)
    },
    canShow: () => unspent() >= cost,
    show() {
      spent += cost
      // With no stride the next note is fetched as soon as one takes its place; with one, only new writing asks.
      if (!stride) fresh = true
    },
    shouldAsk: (held) => fresh && held === 0 && sinceAsk >= stride,
    asked() {
      fresh = false
      sinceAsk = 0
    },
    level: () => Math.floor(unspent() / cost),
    progress: () => (unspent() % cost) / cost,
  }
}
