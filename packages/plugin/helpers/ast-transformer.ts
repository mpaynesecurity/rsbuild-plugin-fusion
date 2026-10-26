import MagicString from "magic-string"
import { randomUUIDv7 } from "node:crypto"
import { getParamType } from "../helpers"
import { parseSync, Visitor, ParseResult } from "oxc-parser"
import { type RpcLoaderOptions } from "../types"

export const useAstTransformer = (code: string, fileName: string, options: RpcLoaderOptions): string => {
	const ms = new MagicString(code)
	
	let idx = 0
	
	const {isBuild, developmentRpcManifest, productionRpcManifest} = options
	
	// Parse the code using the native oxc-parser
	const result: ParseResult = parseSync(`${fileName}.ts`, code)
	
	// Instantiate the `Visitor` pattern explicitly targeting `CallExpression`
	const visitor = new Visitor({
		// Extract the raw text string of the callee from the source code
		CallExpression(node) {
			const calleeTest = code.slice(node.callee.start, node.callee.end)
			
			if(calleeTest.includes(strings.useServerAction)) {
				const rpcId = `${randomUUIDv7()}_fn_${idx++}`
				const firstArg = arguments?.[0]
				
				if(!firstArg) {
					return
				}
				
				let extractedFunction = code.slice(firstArg.start, firstArg.end).trim()
				
				if(firstArg && "params" in firstArg && Array.isArray(firstArg.params)) {
					const offsetModifier = firstArg.start
					
					for(const param of firstArg.params) {
						const typeAnnotation = getParamType(param)
						
						if(typeAnnotation) {
							const relativeStart = typeAnnotation.start - offsetModifier
							const relativeEnd = typeAnnotation.end - offsetModifier
							extractedFunction = extractedFunction.slice(0, relativeStart) + extractedFunction.slice(relativeEnd)
						}
					}
					
					ms.overwrite(
						node.start,
						node.end,
						`(...args) => {return fetch('/fusion/rpc?id=${rpcId}', {method: 'POST',headers: {'Content-Type': 'application/json'},body: JSON.stringify(args),}).then((r) => r.json()).then((d) => d.result)}`,
					)
					
					if(isBuild) {
						productionRpcManifest.set(rpcId, extractedFunction)
					}
					else {
						developmentRpcManifest.set(rpcId, new Function(`let _f = ${extractedFunction}; return _f`)())
					}
				}
			}
		},
	})
	
	visitor.visit(result.program)
	
	return ms.toString()
}