export interface RegistrySpec<T, C = unknown> {
  /** Collect the exact-match keys an entry is registered under. */
  getKeys(entry: T): readonly string[]
  /** Predicate used as a fallback when no exact key matches. Receives an
   *  optional caller-supplied context (e.g. the file name) so a fallback can
   *  decide on more than the lookup key alone. */
  canHandle(entry: T, key: string, context?: C): boolean
}

/**
 * A generic keyed registry with fallback matching.
 *
 * Entries are stored under every exact key returned by `getKeys`. Lookups try
 * an exact key match first, then fall back to iterating entries and asking
 * `canHandle` (optionally with caller-supplied context, e.g. the file name).
 * This is shared by the previewer registry (keyed by MIME type) and the
 * renderer registry (keyed by result type) so both stay symmetric.
 */
export function createRegistry<T, C = unknown>(spec: RegistrySpec<T, C>): {
  register(entry: T): void
  get(key: string, context?: C): T | undefined
  clear(): void
} {
  const entries = new Map<string, T>()

  return {
    register(entry: T): void {
      for (const key of spec.getKeys(entry)) {
        entries.set(key, entry)
      }
    },
    get(key: string, context?: C): T | undefined {
      const exact = entries.get(key)
      if (exact) return exact

      for (const entry of entries.values()) {
        if (spec.canHandle(entry, key, context)) return entry
      }

      return undefined
    },
    clear(): void {
      entries.clear()
    },
  }
}