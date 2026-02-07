// ============================================================================
// Browser bundle entry point - IIFE build for <script> tag usage
// ============================================================================

// Re-export everything from index for browser builds
export * from './index.ts'

// Add a global registration helper for convenience
export { makeInteractive as interactiveMermaid } from './api.ts'
