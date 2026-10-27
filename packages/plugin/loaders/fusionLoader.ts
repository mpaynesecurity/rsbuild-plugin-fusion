import type { Rspack } from "@rsbuild/core"
import { generateHash, useParser } from "../helpers"
import { developmentFnManifest, productionFnManifest } from "../types"

export default function fusionLoader(this: Rspack.LoaderContext, code: string): string | void {
	const filePath = this.resourcePath
	
	const isBuild = this.mode === "production"
	
	//  Clear extension check using the renamed tracking variable token
	if(!filePath.endsWith(".server.ts")) {
		return code
	}
	
	// Generate a client-side file containing fetch endpoints
	const fileHash = generateHash(filePath)
	const clientSource: string[] = []
	
	const {exportedFns} = useParser(filePath, code)
	
	for(const exportedFn of exportedFns) {
		const fnId = `fn_${fileHash}_${exportedFn}`
		
		/*
		 * In Development: The client URL keeps local filepath: /fusion/rpc?id=...&file=...&method=...
		 * In Production: The local filesystem path string is completely omitted from the source code, producing a safe, clean token contract: /fusion/rpc?id=...&method=....
		 */
		const fnUrl = isBuild ? `/fusion/rpc?id=${fnId}&method=${exportedFn}` : `/fusion/rpc?id=${fnId}&file=${encodeURIComponent(filePath)}&method=${exportedFn}`
		
		clientSource.push(`
			export function ${exportedFn}(...args) {
				return fetch('${fnUrl}', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(args)
				}).then(r => r.json()).then(d => d.result)
			}
		`)
		if(isBuild) {
			productionFnManifest.set(fnId, filePath)
		}
		else {
			developmentFnManifest.set(fnId, new Function(`let _f = "${filePath}"; return _f`)())
		}
	}
	
	// Send the client code down the pipeline—zero server logic leaks
	return clientSource.join("\n")
}
