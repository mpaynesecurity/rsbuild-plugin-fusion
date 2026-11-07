import { rspack } from "@rsbuild/core"
import MagicString from "magic-string"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import type { ServerModule } from "./types.ts"

export const generateHash = (hashContent: string): string => {
	return createHash("sha256").update(hashContent).digest("hex").slice(0, 8)
}
/**
 *
 * @param {Request} request
 * @param {string} filePath
 * @param {string} targetMethod
 * @returns {Promise<Response>}
 */
export const useDevServerFnHandler = async (request: Request, filePath: string, targetMethod: string): Promise<Response> => {
	try {
		const args = await request.json() as unknown[]
		
		const serverModule = await import(filePath) as ServerModule
		
		const targetFunction = serverModule[targetMethod]
		
		if(typeof targetFunction !== "function") {
			return Response.json(
				{error: {message: `Export '${targetMethod}' in ${filePath} is not an executable function.`}},
				{status: 500},
			)
		}
		
		const result = await targetFunction(...args)
		
		// Pure standard Response object mapping
		return Response.json({result})
	}
	catch(err: unknown) {
		const errorInstance = err as Error
		return Response.json(
			{error: {message: errorInstance?.message || String(err)}},
			{status: 500},
		)
	}
}


/**
 *
 * @param {Map<string, string>} manifest
 * @param {string} serverFnOutputDir
 * @returns {Promise<void>}
 */
export const generateProdFnBundle = async (manifest: Map<string, string>, serverFnOutputDir: string): Promise<void> => {
	const {swc} = rspack.experiments
	for(const [serverFnId, srcFilePath] of manifest.entries()) {
		const serverFn = await readFile(srcFilePath, "utf-8")
		
		const transpiledServerFn = swc.transformSync(serverFn, {
			filename: serverFn,
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
		
		const msServerFnId = new MagicString(serverFnId)
		// Placeholder for dynamically injected import statements
		const msImports = new MagicString("")
		
		// "fn_13307412_myFnName" -> removes everything up to the final underscore index
		const hashEndIndex = serverFnId.lastIndexOf("_")
		msServerFnId.remove(0, hashEndIndex + 1)
		
		await writeFile(`${serverFnOutputDir}/${msServerFnId.toString()}.js`, transpiledServerFn)
		
		msImports.append(`\nimport {${msServerFnId}} from "./server-fn/${msServerFnId}"\nserverFns.set("${serverFnId}", ${msServerFnId})\n`)
	}
	
}