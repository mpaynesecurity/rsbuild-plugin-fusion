import { tsPlugin } from "@sveltejs/acorn-typescript"
import { Parser } from "acorn"
import type { Node, Program } from "estree"
import MagicString from "magic-string"
import { randomBytes } from "node:crypto"
import { rspack } from "@rsbuild/core"
import { readFile, writeFile } from "node:fs/promises"
import { type Visitors, walk } from "zimmerframe"
import { productionFnManifest, type RuntimeEnvironment, type ServerModule, type VisitorState } from "./types"

/**
 * Generate a unique id (hash) for each rfunction
 * @returns {string}
 * @param length
 */
export const generateHash = (length: number): string => {
	return randomBytes(length).toString("base64").replace("/", "_").replace("+", "-")
}
/**
 *
 * @param {string} code
 * @returns {{exportedFns: string[], result: Program}}
 */
export const parseFns = (code: string): {exportedFns: string[]; result: Program} => {
	const tsParser = Parser.extend(tsPlugin())
	
	const programAst = tsParser.parse(code, {
		sourceType: "module",
		ecmaVersion: "latest",
		locations: true,
	}) as Program
	
	const state: VisitorState = {
		exportedFns: [],
	}
	
	const node: Node = programAst
	
	const visitors: Visitors<Node, VisitorState> = {
		// 1. Hit the export wrapper first
		ExportNamedDeclaration(node, context) {
			// Tell the walker to dive INSIDE the export statement to check the actual declaration
			context.next()
		},
		// 2. This fires for ANY function declaration (including exported ones) e.g export function myFn() {}
		FunctionDeclaration({id}, {path, state}) {
			// Check path history to see if the parent is an export
			const parent = path.at(-1)
			
			if(parent && parent.type === "ExportNamedDeclaration" && id) {
				state.exportedFns.push(id.name)
			}
		},
		// 3. This fires for ANY variable declaration (including exported ones) e.g. export const myFn = () => {}
		VariableDeclaration({declarations}, {state, path}) {
			const parent = path.at(-1)
			
			if(parent && parent.type === "ExportNamedDeclaration") {
				for(const decl of declarations) {
					
					if(decl.id && decl.id.type === "Identifier") {
						state.exportedFns.push(decl.id.name)
					}
				}
			}
		},
	}
	
	walk(node, state, visitors)
	
	return {
		exportedFns: state.exportedFns,
		result: programAst,
	}
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
 * Get the user's current runtime. Mostly used for internal toggles
 * @returns {RuntimeEnvironment}
 */
export const getRuntime = (): RuntimeEnvironment => {
	// Check for Bun's unique global object
	// @ts-ignore - prevents TS from complaining if the Bun types aren't installed
	if(typeof Bun !== "undefined") {
		return "bun"
	}
	
	// Check for Node's versions object
	if(typeof process !== "undefined" && process.versions && process.versions.node) {
		return "node"
	}
	
	return "unknown"
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