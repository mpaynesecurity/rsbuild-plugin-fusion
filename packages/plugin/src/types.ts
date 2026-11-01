import type { Rspack } from "@rsbuild/core"

/**
 * Map based registry to track functions during development
 *
 * @type {Map<string, Function>}
 */
export const developmentFnManifest: Map<string, Function> = new Map<string, Function>()

/**
 * Map based registry to track built functions in production
 *
 * @type {Map<string, string>}
 */
export const productionFnManifest: Map<string, string> = new Map<string, string>()

export interface VisitorState {
	exportedFns: string[]
}

export type ServerModule = Record<string, (...args: unknown[]) => unknown>

export type RuntimeEnvironment = "bun" | "node" | "unknown"

export type Compilation = Rspack.Compilation