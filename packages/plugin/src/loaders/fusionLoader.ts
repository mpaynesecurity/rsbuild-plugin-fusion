import { type Rspack } from "@rsbuild/core"
import MagicString from "magic-string"
import { parseSync } from "oxc-parser"
import { generateHash } from "../helpers.ts"

export default function fusionLoader(this: Rspack.LoaderContext, code: string): string | void {
	const filePath = this.resourcePath
	const isBuild = this.mode === "production"
	
	if(!filePath.endsWith(".ts")) {
		return code
	}
	
	if(!code.includes(`"use fusion"`) && !code.includes(`'use fusion'`)) {
		return code
	}
	
	const result = parseSync(filePath, code, {sourceType: "module"})
	const s: MagicString = new MagicString(code)
	
	const fileHash = generateHash(filePath)
	const fnId = `fn_${fileHash}`
	
	const mutations: {start: number; run: () => void}[] = []
	const exports: string[] = []
	
	if(result.program && Array.isArray(result.program.body)) {
		const programBody = result.program.body
		
		// Dynamically determine the environment without options passing.
		// In production, use an anonymous string ("prod") to remove the local directory.
		// In dev, pass thr raw local path so the server middleware can import it of the local disk
		const runtimeFilePath = isBuild ? "prod" : filePath
		
		// Pass 1: Isolate and strip server-side core import declarations
		for(const statement of programBody) {
			if(statement.type === "ImportDeclaration" && statement.source && typeof statement.source.value === "string") {
				mutations.push({
					start: statement.start,
					run: () => {
						let endPos = statement.end
						while(endPos < code.length && (code[endPos] === ";" || code[endPos] === " " || code[endPos] === "\r" || code[endPos] === "\n")) {
							endPos++
						}
						s.remove(statement.start, endPos)
					},
				})
			}
		}
		
		// Pass 2: Independent processing pass for Export declarations
		for(const statement of programBody) {
			if(statement.type === "ExportNamedDeclaration") {
				const decl = statement.declaration
				
				if(decl) {
					if(decl.type === "FunctionDeclaration" && decl.id && decl.body) {
						const exportName: string = decl.id.name
						const uniqueRpcId = `${fnId}_${exportName}`
						exports.push(exportName)
						
						mutations.push({
							start: statement.start,
							run: () => {
								s.overwrite(
									decl.body!.start,
									decl.body!.end,
									`{
										return fetch('/fusion/rpc?id=${uniqueRpcId}&file=${encodeURIComponent(runtimeFilePath)}&method=${exportName}', {
											method: 'POST',
											headers: { 'Content-Type': 'application/json' },
											body: JSON.stringify(args)
										}).then((r) => r.json()).then((d) => d.result)
									}`,
								)
							},
						})
					}
					
					if(decl.type === "VariableDeclaration" && Array.isArray(decl.declarations)) {
						for(const declarator of decl.declarations) {
							if(
								declarator.id &&
								declarator.id.type === "Identifier" &&
								declarator.id.name &&
								declarator.init
							) {
								const exportName: string = declarator.id.name
								const uniqueRpcId = `${fnId}_${exportName}`
								exports.push(exportName)
								
								mutations.push({
									start: statement.start,
									run: () => {
										s.overwrite(
											declarator.init!.start,
											declarator.init!.end,
											`(...args) => fetch('/fusion/rpc?id=${uniqueRpcId}&file=${encodeURIComponent(runtimeFilePath)}&method=${exportName}', {
													method: 'POST',
													headers: { 'Content-Type': 'application/json' },
													body: JSON.stringify(args)
												}).then((r) => r.json()).then((d) => d.result)`,
										)
									},
								})
							}
						}
					}
				}
			}
		}
		
		mutations.sort((a, b) => b.start - a.start)
		for(const mutation of mutations) {
			mutation.run()
		}
	}
	
	// Prod build compiler step: Emit virtual code strings across the process boundary
	if(isBuild && exports.length > 0) {
		const intermediatePayload = {
			rpcId: fnId,
			filePath,
			exports,
			originalFileCode: code,
		}
		this.emitFile(`.fusion-internal/${fnId}.json`, JSON.stringify(intermediatePayload))
	}
	
	const map = s.generateMap({hires: true})
	
	this.callback(null, s.toString(), {
		debugId: "fusion",
		version: map.version,
		mappings: map.mappings,
		names: map.names,
		file: map.file ?? "",
		sources: map.sources.map((src: string | null) => src ?? ""),
		sourcesContent: map.sourcesContent ? map.sourcesContent.map((c: string | null) => c ?? "") : undefined,
	})
	return
}
