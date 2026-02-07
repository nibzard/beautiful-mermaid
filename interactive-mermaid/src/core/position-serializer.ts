// ============================================================================
// Position Serializer - Export/import node positions for persistence
// ============================================================================

import type { SerializedLayout, DiagramType } from '../types.ts'

/**
 * Current serialization version
 */
const SERIALIZATION_VERSION = 1

/**
 * Generate a storage key for the given source and prefix
 */
export function generateStorageKey(
  source: string,
  prefix: string = 'mermaid-layout'
): string {
  // Create a simple hash of the source for stable key generation
  const hash = simpleHash(source)
  return `${prefix}-${hash}`
}

/**
 * Serialize current positions to JSON
 */
export function serialize(
  positions: Record<string, { x: number; y: number }>,
  source: string,
  diagramType?: DiagramType
): string {
  const data: SerializedLayout = {
    version: SERIALIZATION_VERSION,
    source,
    positions,
    timestamp: Date.now(),
    diagramType,
  }

  return JSON.stringify(data)
}

/**
 * Deserialize positions from JSON
 */
export function deserialize(
  data: string,
  currentSource: string
): Record<string, { x: number; y: number }> | null {
  try {
    const layout = JSON.parse(data) as SerializedLayout

    // Verify version compatibility
    if (layout.version !== SERIALIZATION_VERSION) {
      console.warn(
        `Layout version mismatch: expected ${SERIALIZATION_VERSION}, got ${layout.version}`
      )
      // Continue anyway - try to load it
    }

    // Verify source matches (optional - can be useful for debugging)
    // We don't enforce strict source matching to allow for minor edits

    return layout.positions
  } catch (error) {
    console.error('Failed to deserialize layout data:', error)
    return null
  }
}

/**
 * Save positions to localStorage
 */
export function saveToLocalStorage(
  positions: Record<string, { x: number; y: number }>,
  source: string,
  storageKeyPrefix?: string
): void {
  const key = generateStorageKey(source, storageKeyPrefix)
  const data = serialize(positions, source)

  try {
    localStorage.setItem(key, data)
  } catch (error) {
    console.error('Failed to save layout to localStorage:', error)
  }
}

/**
 * Load positions from localStorage
 */
export function loadFromLocalStorage(
  source: string,
  storageKeyPrefix?: string
): Record<string, { x: number; y: number }> | null {
  const key = generateStorageKey(source, storageKeyPrefix)

  try {
    const data = localStorage.getItem(key)
    if (!data) return null

    return deserialize(data, source)
  } catch (error) {
    console.error('Failed to load layout from localStorage:', error)
    return null
  }
}

/**
 * Clear saved positions from localStorage
 */
export function clearFromLocalStorage(
  source: string,
  storageKeyPrefix?: string
): void {
  const key = generateStorageKey(source, storageKeyPrefix)

  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.error('Failed to clear layout from localStorage:', error)
  }
}

/**
 * Check if there are saved positions in localStorage
 */
export function hasSavedPositions(
  source: string,
  storageKeyPrefix?: string
): boolean {
  const key = generateStorageKey(source, storageKeyPrefix)

  try {
    return localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

/**
 * Get all saved layout keys from localStorage (for management UIs)
 */
export function getAllSavedLayoutKeys(storageKeyPrefix?: string): string[] {
  const prefix = storageKeyPrefix || 'mermaid-layout'
  const keys: string[] = []

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix)) {
        keys.push(key)
      }
    }
  } catch (error) {
    console.error('Failed to enumerate localStorage keys:', error)
  }

  return keys
}

/**
 * Clear all saved layouts (for management UIs)
 */
export function clearAllSavedLayouts(storageKeyPrefix?: string): void {
  const keys = getAllSavedLayoutKeys(storageKeyPrefix)

  for (const key of keys) {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.error(`Failed to clear layout key ${key}:`, error)
    }
  }
}

/**
 * Get metadata about a saved layout without loading the full data
 */
export interface LayoutMetadata {
  key: string
  timestamp: number
  nodeCount: number
  diagramType?: DiagramType
}

export function getLayoutMetadata(
  source: string,
  storageKeyPrefix?: string
): LayoutMetadata | null {
  const key = generateStorageKey(source, storageKeyPrefix)

  try {
    const data = localStorage.getItem(key)
    if (!data) return null

    const layout = JSON.parse(data) as SerializedLayout

    return {
      key,
      timestamp: layout.timestamp,
      nodeCount: Object.keys(layout.positions).length,
      diagramType: layout.diagramType,
    }
  } catch (error) {
    console.error('Failed to get layout metadata:', error)
    return null
  }
}

/**
 * Simple hash function for generating stable storage keys
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}
