import { type RsbuildPlugin, rspack } from "@rsbuild/core"
import MagicString from "magic-string"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readdir, rm } from "node:fs/promises"
import { dirname, resolve } from "node:path"

const filename = Bun.fileURLToPath(import.meta.url)

const localDirectory = dirname(filename)

export const fusionPlugin = (): RsbuildPlugin => ({
	name: "fusion",
	enforce: "pre",
	setup({logger, modifyRspackConfig, onBeforeStartDevServer, onCloseBuild, context}) {
		
		modifyRspackConfig(({module}) => {
			module = module || {}
			module.rules = module.rules || []
			
			const fusionLoader = resolve(localDirectory, "loaders", "fusionLoader.js")
			
			if(!fusionLoader) {
				console.error(`${fusionLoader} was not found`)
				process.exit(1)
			}
			
			module.rules.push({
				test: /\.(tsx|jsx|svelte|vue|ts)$/,
				exclude: /node_modules/,
				enforce: "pre",
				use: [
					{
						loader: fusionLoader,
					},
				],
			})
		})
		
		onBeforeStartDevServer(({server}) => {
			server.middlewares.use(async (req, res, next) => {
				const url = new URL(req.url || "/", `http://${req.headers.host}`)
				
				if(!url.pathname.startsWith("/fusion/rpc")) {
					return next()
				}
				
				const relativeFileParam = url.searchParams.get("file")
				const targetMethod = url.searchParams.get("method")
				
				if(!relativeFileParam || !targetMethod) {
					res.statusCode = 400
					return res.end("Missing RPC query parameters")
				}
				
				const bodyBuffers: Uint8Array[] = []
				
				req.on("data", (chunk) => bodyBuffers.push(chunk))
				
				req.on("end", async () => {
					try {
						const rawBodyText = Buffer.concat(bodyBuffers).toString("utf-8")
						const args = JSON.parse(rawBodyText || "[]") as unknown[]
						
						// Resolve the anonymous relative path parameter against the active system working directory
						const absoluteDevFilePath = resolve(process.cwd(), relativeFileParam)
						
						// Standard native dynamic import statement block - completely mapless
						const serverModule = await import(absoluteDevFilePath)
						const targetFunction = serverModule[targetMethod]
						
						if(typeof targetFunction !== "function") {
							throw new TypeError(`Export '${targetMethod}' in ${absoluteDevFilePath} is not an executable function.`)
						}
						
						const result = await targetFunction(...args)
						
						res.writeHead(200, {"Content-Type": "application/json"})
						res.end(JSON.stringify({result}))
					}
					catch(err: unknown) {
						const errorInstance = err as Error
						res.writeHead(500, {"Content-Type": "application/json"})
						res.end(JSON.stringify({
							error: {
								message: errorInstance?.message || String(err),
								stack: errorInstance?.stack,
							},
						}))
					}
				})
			})
		})
		
		
		onCloseBuild(async () => {
			if(context.action !== "build") {
				return
			}
			logger.start("Starting build process")
			
			const distPath = resolve(context.rootPath, context.distPath)
			
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
			
			const serverEngineTemplate = resolve(localDirectory, "templates", "serverEngine.js")
			
			if(!existsSync(serverEngineTemplate)) {
				logger.error(`${serverEngineTemplate} not found`)
				process.exit(1)
			}
			
			const serverEngineCode = await Bun.file(serverEngineTemplate).text()
			const msServerCode = new MagicString(serverEngineCode)
			
			msServerCode.prepend(`let serverFns = new Map()\n${serverFns.toString()}`)
			const indexFile = resolve(distPath, "index.js")
			await Bun.write(indexFile, msServerCode.toString())
			logger.success(`Build artifacts written to ${distPath}`)
		})
	},
})