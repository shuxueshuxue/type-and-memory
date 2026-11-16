// The whole contract. Everything else in the repo is either the page
// (src/editor), or something that implements one of these (src/stores,
// src/agents, hosts/*).

/** Who is speaking in the margin: a persona, or a real agent in the host. */
export interface Voice {
  id: string
  name: string
  /** 0–360. Omitted: derived from the id, stable across sessions. */
  hue?: number
}

export interface Turn {
  /** A voice name, or 'writer' for the person at the keyboard. */
  from: string
  text: string
  at: number
}

/**
 * A note pinned to a phrase. The anchor is the phrase itself, not an offset:
 * it survives edits anywhere else, travels through any storage that can hold
 * text, and an agent can produce it without knowing positions.
 * No quote: a whisper under the last line, gone once the writer moves on.
 */
export interface Mark {
  id: string
  quote: string
  note: string
  voice: string
  hue: number
  at: number
  thread?: Turn[]
  /** The host's address for whoever wrote the note, when it has one: an answer goes back to them. */
  by?: string
}

export interface Doc {
  text: string
  marks: Mark[]
}

/** Where the page lives. `watch` is for stores someone else can write to. */
export interface Store {
  load(): Promise<Partial<Doc> | null>
  save(doc: Doc): Promise<void>
  /** A store that carries the text over a live binding of its own reports marks only. */
  watch?(onChange: (doc: Partial<Doc>) => void): () => void
}

/**
 * What an agent can do to the page. Hosts with their own agents (a chat's
 * agent, a harness) expose exactly these three as tools; nothing else crosses.
 * `annotate` and `reply` throw DeskError with a sentence the agent can act on.
 */
export interface Desk {
  read(): { text: string; marks: Mark[] }
  annotate(input: { quote?: string; note: string; as?: string }): Mark
  reply(input: { mark: string; text: string; as?: string }): void
}

/** What the page asks of an agent. An agent may also act unasked. */
export type Ask =
  /** The writer finished a clause; have a look. `want`: how many notes are welcome at once (one if absent). */
  | { kind: 'glance'; focus?: string; want?: number }
  /** The writer has stopped for a moment; a short nudge under the last line is welcome. */
  | { kind: 'lull' }
  /** The writer answered a note. */
  | { kind: 'reply'; mark: Mark; text: string }

export interface AgentLink {
  ask(ask: Ask): void | Promise<void>
  close?(): void
}

/** An agent is anything that, given a desk, can be asked. */
export type Agent = (desk: Desk) => AgentLink

export class DeskError extends Error {}
