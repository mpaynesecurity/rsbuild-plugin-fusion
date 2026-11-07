/**
 * Map based registry to track built functions in production
 *
 * @type {Map<string, string>}
 */
export const productionFnManifest: Map<string, string> = new Map<string, string>()

export type ServerModule = Record<string, (...args: unknown[]) => unknown>