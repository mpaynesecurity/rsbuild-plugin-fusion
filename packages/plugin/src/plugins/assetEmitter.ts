import { type RsbuildContext, rspack, type Rspack } from "@rsbuild/core"
import MagicString from "magic-string"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { mkdir, readdir, rm } from "node:fs/promises"
import { resolve } from "node:path"

export class FusionAssetEmitterPlugin {
	private readonly context: RsbuildContext
	
	private readonly localDirectory: string
	
	constructor(context: RsbuildContext, localDirectory: string) {
		this.context = context
		this.localDirectory = localDirectory
	}
	
	apply(compiler: Rspack.Compiler): void {
		if(this.context.action !== "build") {
			return
		}
		
		compiler.hooks.afterEmit.tapAsync("FusionServerFnPlugin", async (compilation, callback) => {
			try {
				console.info("Starting build process")
				
				const distPath = resolve(this.context.rootPath, this.context.distPath)
				
				const serverFns = new MagicString("")
				const serverFnOutputDir = resolve(distPath, "server-fn")
				
				if(!existsSync(serverFnOutputDir)) {
					await mkdir(serverFnOutputDir, {recursive: true})
				}
				
				const compiledFiles = new Set<string>()
				
				// Process the virtual intermediate modules serialized by Rspack's asset pool
				const intermediateDir = resolve(distPath, ".fusion-internal")
				
				if(existsSync(intermediateDir)) {
					const internalMetaFiles = await readdir(intermediateDir)
					
					for(const metaFile of internalMetaFiles) {
						if(!metaFile.endsWith(".json")) continue
						
						const metaFilePath = resolve(intermediateDir, metaFile)
						const metaData = JSON.parse(await Bun.file(metaFilePath).text())
						
						const {filePath, exports, originalFileCode} = metaData
						
						// Compute an anonymous file-level token hash
						const fileHash = createHash("sha256").update(filePath).digest("hex").slice(0, 8)
						const cleanFileToken = `fn_${fileHash}`
						
						const rpcFileName = `${cleanFileToken}.js`
						const rpcFilePath = resolve(serverFnOutputDir, rpcFileName)
						
						if(!compiledFiles.has(filePath)) {
							const vanillaJsContent = rspack.experiments.swc.transformSync(originalFileCode, {
								filename: filePath,
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
							
							const cleanProductionServerCode = vanillaJsContent
								.replace(/"use fusion"?\s*/g, "")
								.replace(/'use fusion'?\s*/g, "")
							
							await Bun.write(rpcFilePath, cleanProductionServerCode.trim())
							compiledFiles.add(filePath)
						}
						
						// Emit one, file-unique namespace alias BEFORE looping through functions
						serverFns.append(`import * as ${cleanFileToken} from "./server-fn/${rpcFileName}"\n`)
						
						// Map each individual function export directly using the module alias
						for(const name of exports) {
							const uniqueProductionToken = `${cleanFileToken}_${name}`
							
							// Maps the RPC token directly to the executable function inside the namespace object
							serverFns.append(`serverFns.set("${uniqueProductionToken}", ${cleanFileToken}.${name})\n`)
						}
						
						// Erase the temporary tracking artifact
						await rm(metaFilePath)
					}
					await rm(intermediateDir, {recursive: true, force: true})
				}
				
				const serverEngineTemplate = resolve(this.localDirectory, "templates", "serverEngine.js")
				
				if(!existsSync(serverEngineTemplate)) {
					console.error(`${serverEngineTemplate} not found`)
					process.exit(1)
				}
				
				const serverEngineCode = await Bun.file(serverEngineTemplate).text()
				const msServerCode = new MagicString(serverEngineCode)
				
				msServerCode.prepend(`let serverFns = new Map()\n${serverFns.toString()}`)
				const indexFile = resolve(distPath, "index.js")
				await Bun.write(indexFile, msServerCode.toString())
				console.info(`Build artifacts written to ${distPath}`)
				
				callback()
			}
			catch(error) {
				callback(error as Error)
			}
		})
	}
}