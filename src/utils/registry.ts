export interface RegistrySpec<T> {
  /** Collect the exact-match keys an entry is registered under. */
  getKeys(entry: T): readonly string[]
  /** Predicate used as a fallback when no exact key matches. */
  canHandle(entry: T, key: string): boolean
}

/**
 * A generic keyed registry with fallback matching.
 *
 * Entries are stored under every exact key returned by `getKeys`. Lookups try
 * an exact key match first, then fall back to iterating entries and asking
 * `canHandle`. This is shared by the previewer registry (keyed by MIME type)
 * and the renderer registry (keyed by result type) so both stay symmetric.
 */
export function createRegistry<T>(spec: RegistrySpec<T>): {
  register(entry: T): void
  get(key: string): T | undefined
  clear(): void
} {
  const entries = new Map<string, T>()

  return {
    register(entry: T): void {
      for (const key of spec.getKeys(entry)) {
        entries.set(key, entry)
      }
    },
    get(key: string): T | undefined {
      const exact = entries.get(key)
      if (exact) return exact

      for (const entry of entries.values()) {
        if (spec.canHandle(entry, key)) return entry
      }

      return undefined
    },
    clear(): void {
      entries.clear()
    },
  }
}