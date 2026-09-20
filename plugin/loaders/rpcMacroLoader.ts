/**
 * @module rpcMacroLoader
 */

import { type Rspack } from "@rsbuild/core"
import MagicString from "magic-string"
import { parseSync } from "oxc-parser"
import { parseAndWalk } from "oxc-walker"
import { generateHash, getParamType } from "../helpers"
import { OxcNode, RpcLoaderOptions } from "../types"


export default function rpcMacroLoader(this: Rspack.LoaderContext<RpcLoaderOptions>, code: string): string | void {
	// Path string of the current Rspack module
	const id = this.resourcePath
	
	// Options passed in by the loader's user
	const options: RpcLoaderOptions = this.getOptions()
	
	// Destructure and define the loader's options
	const {
		isBuild,
		productionRpcManifest,
		localRpcFunctions,
	} = options
	
	const isValidExtension = /\.(tsx|jsx|svelte|vue|ts)$/.test(id)
	const hasServerAction = code.includes("useServerAction$")
	
	// Return the code is it is not a supported file type, or it does not contain `useServerAction$`
	if(!isValidExtension && !hasServerAction) {
		return code
	}
	
	// Generate a file hash based on runtime environment
	const fileHash = generateHash(id)
	
	const s = new MagicString(code)
	let idx = 0
	
	// Primary AST entry point
	parseAndWalk(code, id, {
		// Required since parseAndWalk is not used with Rolldown
		parseSync,
		async enter(node: OxcNode) {
			// Enter if type of the node is a `CallExpression`
			if(node.type === "CallExpression") {
				/*
				 * Once we enter the node, we are looking for two things;
				 * 	1. Type of AST node caller is an `Identifier`,
				 * 	2. Name of the caller is our `useServerAction$` macro.
				 *
				 * 	If both criteria are met, we can begin processing and extracting the server action
				 */
				if(node.callee.type === "Identifier" && node.callee.name === "useServerAction$") {
					// Generate a unique id for each rpc function
					const rpcId = `${fileHash}_fn_${idx++}`
					
					/**
					 * Isolate everything inside `()` from the formated array.
					 * ```ts
					 * useServerAction$(async () => {})
					 * // async () => {} represents arg[0]
					 * ```
					 */
					const firstArg = node.arguments?.[0]
					
					// Return if `firstArg` does not exist, meaning the user did not pass in any code
					if(!firstArg) {
						return
					}
					/**
					 * Extract the "server only" code based off the start and end point of the first argument
					 * passed to the macro (the async closure)
					 *
					 * ```
					 * - useServerAction$(async () => {})
					 * + useServerAction$()
					 * ```
					 */
					let extractedFunction = code.slice(firstArg.start, firstArg.end).trim()
					
					// Strip type annotations `paramName: type` using the exact AST positions provided by the parser
					if(firstArg && "params" in firstArg && Array.isArray(firstArg.params)) {
						const offsetModifier = firstArg.start
						//const sortedParams = [...firstArg.params].sort((a, b) => b.start - a.start)
						
						for(const param of firstArg.params) {
							const typeAnnotation = getParamType(param)
							if(typeAnnotation) {
								const relativeStart = typeAnnotation.start - offsetModifier
								const relativeEnd = typeAnnotation.end - offsetModifier
								extractedFunction = extractedFunction.slice(0, relativeStart) + extractedFunction.slice(relativeEnd)
							}
						}
					}
					// Convert the stripped out server action into a rpc endpoint
					s.overwrite(
						node.start,
						node.end,
						`(...args) => {
					  const fd = new FormData()
					  args.forEach((arg, i) => {
					    if (arg instanceof File || arg instanceof Blob) {
					      fd.append('arg_' + i, arg)
					    } else {
					      fd.append('arg_' + i, JSON.stringify(arg))
					    }
					  })
					  return fetch('/fusion/rpc?id=${rpcId}', { method: 'POST', body: fd }).then((r) => r.json()).then((d) => d.result)
					}`,
					)
					
					if(isBuild) {
						productionRpcManifest.set(rpcId, extractedFunction)
					}
					else {
						// Assigning to a statement block handles concise arrows, structures, and expressions
						localRpcFunctions.set(rpcId, new Function(`let _f = ${extractedFunction}; return _f`)())
					}
				}
			}
		},
	})
	
	const map = s.generateMap({hires: true})
	
	this.callback(null, s.toString(), {
		debugId: "fusion",
		version: map.version,
		mappings: map.mappings,
		names: map.names,
		file: map.file ?? "",
		sources: map.sources.map(src => src ?? ""),
		sourcesContent: map.sourcesContent
		                ? map.sourcesContent.map(content => content ?? "")
		                : undefined,
	})
	return
}
