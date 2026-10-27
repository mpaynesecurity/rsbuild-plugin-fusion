export const clientAssets: Record<
	string,
	{content: string; isGzip: boolean}
> = {}

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

