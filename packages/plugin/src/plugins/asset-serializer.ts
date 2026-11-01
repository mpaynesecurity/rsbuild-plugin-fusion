import { type RsbuildContext, rspack } from "@rsbuild/core"
import MagicString from "magic-string"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

export class AssetSerializer {
	constructor() {
	}
	
	/**
	 * Generates the ESM import string block for server manifest functions
	 */
	static generateServerManifestImports(productionFnManifest: Map<string, string>, context: RsbuildContext): string {
		console.info("Generating server manifest")
		
		if(context.action !== "build") {
			return ""
		}
		
		const prodDistPath = context.distPath
		const serverFnOutputDir = `${prodDistPath}/server-fn`
		
		mkdirSync(serverFnOutputDir, {recursive: true})
		
		// FIX THE POINTER ENGINE CRASH:
		// Use a clean, isolated MagicString instance container local strictly to this execution pass execution
		const msImports = new MagicString("")
		if(productionFnManifest.size === 0) {
			console.error("Did not find any functions")
			process.exit(1)
		}
		
		for(const [serverFnId, srcFilePath] of productionFnManifest.entries()) {
			const serverFn = readFileSync(srcFilePath, "utf-8")
			
			const transpiledServerFn = rspack.experiments.swc.transformSync(serverFn, {
				filename: srcFilePath,
				jsc: {
					parser: {
						syntax: "typescript",
					},
					target: "esnext",
				},
				module: {
					type: "nodenext",
				},
			}).code
			
			// Create a separate, localized variable snapshot container for this iteration loop pass
			const currentFnId = String(serverFnId)
			const msServerFnId = new MagicString(currentFnId)
			
			const hashEndIndex = currentFnId.lastIndexOf("_")
			msServerFnId.remove(0, hashEndIndex + 1)
			
			// Extract the text primitive value cleanly BEFORE appending to block pointers to avoid loop leakage
			const isolatedFnName = msServerFnId.toString().trim()
			
			// Write out the raw transpiled file to disk in your outDir structure cleanly
			writeFileSync(`${serverFnOutputDir}/${msServerFnId.toString()}.js`, transpiledServerFn)
			
			// Append utilizing pristine, un-mutated string fields to prevent internal pointer duplication crashes
			msImports.prepend(`let serverFns = new Map\nimport {${isolatedFnName}} from "./server-fn/${isolatedFnName}"\nserverFns.set("${serverFnId}", ${isolatedFnName})\n`)
		}
		return msImports.toString()
	}
	
}
