import type { SourceMap } from "magic-string"

export const clientAssets: Record<
	string,
	{content: string; isGzip: boolean}
> = {}

/**
 * Module-scoped map registry tracks live actions during development
 *
 * @type {Map<string, Function>}
 */
export const developmentRpcManifest: Map<string, Function> = new Map<string, Function>()

/**
 * Registry map which holds the compiled production rpc function calls
 *
 * @type {Map<string, string>}
 */
export const productionRpcManifest: Map<string, string> = new Map<string, string>()

/**
 * @type {(err?: any) => void}
 */
export type NextFunction = (err?: any) => void

/**
 * Options passed to the loader
 */
export interface RpcLoaderOptions {
	/**
	 * @summary
	 * Registry map which holds the compiled production rpc function calls
	 *
	 * @example
	 * ```ts
	 * productionRpcManifest.set("abc123", srvAction.mjs)
	 * ```
	 */
	productionRpcManifest: Map<string, string>
	/**
	 * @summary
	 * Module-scoped map registry tracks live actions during development
	 *
	 * @example
	 * ```ts
	 * localRpcFunctions.set("abc123", srvAction.mjs)
	 * ```
	 */
	developmentRpcManifest: Map<string, Function>
}
