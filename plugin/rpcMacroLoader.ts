/**
 * @module rpcMacroLoader
 */

import { type Rspack } from "@rsbuild/core"
import MagicString from "magic-string"
import { type FormalParameter, type TSType, type TSTypeAnnotation, parseSync } from "oxc-parser"
import { parseAndWalk } from "oxc-walker"

/**
 * Options passed to the loader
 */
export interface RpcLoaderOptions {
	/**
	 * Are we building for production?
	 */
	isBuild: boolean
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
	localRpcFunctions: Map<string, Function>
}

/**
 * #### TS Gymnastics Part 1: The Parameter Box
 *
 * @summary
 * Represents a union of completely different structures, they only share two baseline properties that we
 * can safely read before the type can be narrowed:
 *
 * #### .type(string):
 * The literal discriminator string (e.g., `CallExpression`, `Identifier`). This is the key to unlocking the rest of the node's fields.
 *
 * #### .span(object)
 * An object containing start and end byte offsets ({ start: number, end: number }).
 * This tells us exactly where that specific piece of code lives in the raw file string.
 */
type OxcNode = Parameters<NonNullable<NonNullable<Parameters<typeof parseAndWalk>[2]>["enter"]>>[0]

/**
 * #### TS Gymnastics Part 2: The massive union
 *
 * @summary
 * When we iterate through firstArg.params, we are looking at the parameter definitions of the function.
 * The problem is, parameters aren't just a string name because JavaScript allows things like
 * `function({ id })` (destructuring) or `function(public id: string)` (TypeScript constructors).
 * This custom type acts as a grammatical anchor tag in the code. It literally tells the compiler,
 * "Everything following `:` until a comma or closing parenthesis is a type definition."
 */
type OxcParam = NonNullable<Extract<OxcNode, {params?: unknown}>["params"]>[number]

/**
 * #### TS Gymnastics Parts 3 and 4: The Annotation Wrapper and  Inner Type Node
 *
 * @summary
 *  ### The annotation wrapper `TsTypeAnnotation`
 *  Acts as a "grammatical anchor" for `:` in the code.
 *  It tells the compiler, "everything following the colon until a comma or closing parenthesis is a type definition.
 *  It doesn't hold the type name itself". It has a single property called `.typeAnnotation` which points to the actual "type".
 *
 *  ### The inner node type `typeAnnotation.typeAnnotation`
 *  Holds the actual information type information, and why we had to use startsWith and
 *  endsWith in the utility function. OXC classifies types into strict structural buckets, `Primitive Keywords` and
 *  `Type References`
 *
 *  #### Primitive Keywords (TSStringKeyword, TSNumberKeyword)
 *  The parser encounters a built-in language primitive. It explicitly names the node after the primitive to save processing time.
 *
 *  #### Type References (TSTypeReference)
 *  The parser encounters a word it doesn't natively own (like a custom class or interface User). It flags it as
 *  a "reference" and sticks the name inside a nested .typeName.name object.
 *
 * @param {OxcParam} param
 * @returns {TSTypeAnnotation | TSType | null | undefined }
 */
const getParamType = (param: OxcParam): TSTypeAnnotation | TSType | null | undefined => {
	if(param.type === "TSParameterProperty") {
		const inner: FormalParameter = param.parameter
		return "typeAnnotation" in inner ? inner.typeAnnotation : null
	}
	return "typeAnnotation" in param ? param.typeAnnotation : null
}

/**
 *
 * @param {string} code
 * @returns {string | void}
 */
export default function rpcMacroLoader(this: Rspack.LoaderContext<RpcLoaderOptions>, code: string): string | void {
	// Path string of the current Rspack module
	const id = this.resourcePath
	
	// Options passed in by the loader's user
	const options: RpcLoaderOptions = this.getOptions()
	
	// Destructure and define this loader's options
	const {
		isBuild,
		productionRpcManifest,
		localRpcFunctions,
	} = options
	
	/*
	 * Return the code if the path of the current module does not meet the following criteria
	 * 1. Path starts with `\0`
	 * 2. The code does not include `useServerAction$`
	 */
	if(!/\.(tsx|jsx|svelte|vue|ts)$/.test(id)
		|| id.startsWith("\0")
		|| !code.includes("useServerAction$")) {
		return code
	}
	
	// Generate a file hash based on runtime environment
	const fileHash = Bun.hash(id.replace(/\\/g, "/")).toString().substring(0, 8)
	
	const s = new MagicString(code)
	let idx = 0
	
	// Primary AST entry point
	parseAndWalk(code, id, {
		// Required since parseAndWalk is not used with Rolldown
		parseSync,
		enter(node: OxcNode) {
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
					/**
					 * @todo Move the commented out logic into it's own file.
					 * At the moment, the string replacement is not working and is totally
					 * breaking the rpc logic.
					 */
					// const filename = Bun.fileURLToPath(import.meta.url)
					// const localDirectory = dirname(filename)
					
					// const rpcEndpointTemplatePath = resolve(localDirectory, "templates", "rpcEndpoint.js")
					// const rpcEndpointTemplateFile = await Bun.file(rpcEndpointTemplatePath).text()
					//
					// const rpcInjectionToken = `/!*__RPC_ID__*/`
					//
					// const msRpcEndpointTemplateFile = new MagicString(rpcEndpointTemplateFile).replace(rpcInjectionToken, `"/fusion/rpc?id=${rpcId}"`)
					//
					// s.overwrite(
					// 	node.start,
					// 	node.end,
					// 	msRpcEndpointTemplateFile.toString(),
					// )
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
