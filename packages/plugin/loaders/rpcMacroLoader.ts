import type { Rspack } from "@rsbuild/core"
import { parseSync } from "oxc-parser"
import { generateHash } from "../helpers"
import type { RpcLoaderOptions } from "../types"

export default function rpcMacroLoader(this: Rspack.LoaderContext<RpcLoaderOptions>, code: string): string | void {
	// FIX 1: Renamed variable from 'id' to 'filePath' to stop name collisions in Bun's dev context
	const filePath = this.resourcePath
	
	const isBuild = this.mode === "production"
	
	const options = this.getOptions()
	const {productionRpcManifest, developmentRpcManifest} = options
	
	// FIX 2: Clear extension check using the renamed tracking variable token
	if(!filePath.endsWith(".server.ts")) {
		return code
	}
	// Let OXC parse the file once just to find the names of the exported functions
	const result = parseSync(filePath, code, {lang: "ts", sourceType: "module"})
	
	const exports: string[] = []
	
	// Check if program body parsed successfully to prevent crashes
	if(result.program && result.program.body) {
		for(const statement of result.program.body) {
			if(statement.type === "ExportNamedDeclaration" && statement.declaration) {
				const decl = statement.declaration
				
				// Handles: export function myFn() {}
				if(decl.type === "FunctionDeclaration" && decl.id) {
					exports.push(decl.id.name)
				}
				
				// Handles: export const myFn = () => {}
				if(decl.type === "VariableDeclaration") {
					for(const declarator of decl.declarations) {
						// FIX TS2367: Use an 'in' check or cast the type field so the strict type checker shuts up
						if(declarator.id && "type" in declarator.id) {
							const idNode = declarator.id as Record<string, any>
							if((idNode.type === "BindingIdentifier" || idNode.type === "Identifier") && idNode.name) {
								exports.push(idNode.name)
							}
						}
					}
				}
			}
		}
	}
	
	// Generate a client-side file containing fetch endpoints
	const fileHash = generateHash(filePath)
	const clientSource: string[] = []
	
	for(const exportName of exports) {
		const rpcId = `fn_${fileHash}_${exportName}`
		
		// Normalize Windows file paths for safe network transport
		const safePath = filePath.replace(/\\/g, "/")
		
		/*
		 * In Development: The client URL keeps local filepath: /fusion/rpc?id=...&file=...&method=...
		 * In Production: The local filesystem path string is completely omitted from the source code, producing a safe, clean token contract: /fusion/rpc?id=...&method=....
		 */
		const rpcUrl = isBuild ? `/fusion/rpc?id=${rpcId}&method=${exportName}` : `/fusion/rpc?id=${rpcId}&file=${encodeURIComponent(safePath)}&method=${exportName}`
		
		// FIX: Include the 'file' and 'method' parameters that your server middleware requires
		// clientSource.push(`
		// 	export function ${exportName}(...args) {
		// 		return fetch('/fusion/rpc?id=${rpcId}&file=${encodeURIComponent(safePath)}&method=${exportName}', {
		// 			method: 'POST',
		// 			headers: { 'Content-Type': 'application/json' },
		// 			body: JSON.stringify(args)
		// 		}).then(r => r.json()).then(d => d.result)
		// 	}
		// `)
		
		clientSource.push(`
			export function ${exportName}(...args) {
				return fetch('${rpcUrl}', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(args)
				}).then(r => r.json()).then(d => d.result)
			}
		`)
		if(isBuild) {
			productionRpcManifest.set(rpcId, filePath)
		}
		else {
			developmentRpcManifest.set(rpcId, new Function(`let _f = "${filePath.replace(/\\/g, "/")}"; return _f`)())
		}
	}
	
	// Send the client code down the pipeline—zero server logic leaks
	return clientSource.join("\n")
}
