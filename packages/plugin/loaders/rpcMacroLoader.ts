import { type Rspack } from "@rsbuild/core"
import MagicString from "magic-string"
import { createHash } from "node:crypto"
import { parseSync } from "oxc-parser"


export default function rpcMacroLoader(this: Rspack.LoaderContext, code: string): string | void {
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
	
	const fileHash = createHash("sha256").update(filePath).digest("hex").slice(0, 8)
	const rpcId: string = `fn_${fileHash}`
	
	const mutations: {start: number; run: () => void}[] = []
	const exports: string[] = []
	
	if(result.program && Array.isArray(result.program.body)) {
		const programBody = result.program.body
		
		// FIX: Dynamically determine the environment without options passing.
		// In production, use an anonymous safe string ("prod") to scrub your home directory.
		// In dev, pass your raw local path so your server middleware can import it cleanly off your disk!
		
		const runtimeFilePath = isBuild ? "prod" : filePath.replace(/\\/g, "/")
		
		// PASS 1: Isolate and strip native server-side core import declarations safely
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
		
		// PASS 2: Independent processing pass for Export declarations
		for(const statement of programBody) {
			if(statement.type === "ExportNamedDeclaration") {
				const decl = statement.declaration
				
				if(decl) {
					if(decl.type === "FunctionDeclaration" && decl.id && decl.body) {
						const exportName: string = decl.id.name
						const uniqueRpcId = `${rpcId}_${exportName}`
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
		}).then((r) => r.json()).then((d) => d.result);
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
								const uniqueRpcId = `${rpcId}_${exportName}`
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
	
	
	// PROD BUILD COMPILER SIDE-STEP: Emit virtual code strings across the process boundary natively
	if(isBuild && exports.length > 0) {
		const intermediatePayload = {
			rpcId,
			filePath,
			exports,
			originalFileCode: code,
		}
		this.emitFile(`.fusion-internal/${rpcId}.json`, JSON.stringify(intermediatePayload))
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
