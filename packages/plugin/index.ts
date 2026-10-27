/**
 * ## How it works
 * ### The Macro Boundary:
 * #### api.modifyRspackConfig
 *
 * Fusion uses a custom `Rspack` loader to target code structures wrapped in`useServer$()`. In the browser, it drops in a
 * standard network `fetch()`. On the server, it captures the raw string code expression to register it into the execution
 * map.
 *
 * ### Dual-Context Development Gateway:
 * #### api.onBeforeStartDevServer
 *
 * During development, Fusion routes requests through a local module-isolated tracking map (`localRpcFunctions`). When a
 * network call hits `/fusion/rpc`, it uses standard Node.js structures to run the function in-memory inside Rsbuild's dev
 * environment.
 *
 * ### The Production Build:
 * #### api.onCloseBuild
 * 1. Loop through the compiled frontend asset folder (s)`dist/static/(css/js)`, pack them into compressed base64 string,
 *    and drop them into the `clientAssets` object.
 *
 *
 * 2. Loop through the extracted the server actions, and them to the `rpcFunctions ` map and place them into the
 *    `dist/rpc` folder where they are referenced by `dist/index.mjs`
 *
 * ## Fusion vs. Meta-Frameworks
 * #### 1. Handling of browser and server code
 *
 * Meta-frameworks treat the browser build and server build as completely separate targets that require a heavy bridge to
 * talk to each other. Fusion blends both code bases together and combines them into a single build process with minimal
 * runtime dependencies.
 *
 * #### 2. Elimination of Code-Splitting and Chunks Manifests
 *
 * Meta-frameworks have to generate dozens of sliced chunks and maintain a massive JSON layout file to map client-side
 * network stubs back to server-side files. Fusion cuts out that entire layer because every image, script, stylesheet, and
 * server action lives inside the same single file memory space.
 *
 * #### 3. Single-Pass High Performance Routing
 *
 * Instead of spinning up heavy application routing instances or framework controllers, Fusion matches assets out of a
 * native JavaScript object (`ASSETS`) and serves them directly out of RAM. Text assets are pre-gzipped during compilation,
 * meaning the server doesn't waste CPU cycles compressing assets on the fly.
 *
 * #### 4. Safe Server Isolation and Closure Execution
 *
 * Fusion's utilization of explicit dynamic imports inside its `useServerAction$` macro allows for full access to database
 * modules, file systems, and server utilities, but ensures their code is never leaked into the browser bundle. The browser
 * only receives a `fetch()` call, giving absolute isolation without complex compiler layers.
 *
 * @module fusionPlugin
 */

import { type RsbuildPlugin } from "@rsbuild/core"
import { rspack } from "@rslib/core"
import MagicString from "magic-string"
import { existsSync } from "node:fs"
import { mkdir, readdir, stat } from "node:fs/promises"
import { type IncomingMessage, type ServerResponse } from "node:http"
import { dirname, relative, resolve } from "node:path"
import { clientAssets, productionFnManifest } from "./types"

export const fusionPlugin = (): RsbuildPlugin => ({
	name: "fusion",
	enforce: "pre",
	setup({logger, modifyRspackConfig, onBeforeStartDevServer, onCloseBuild, context}) {
		const filename = Bun.fileURLToPath(import.meta.url)
		const localDirectory = dirname(filename)
		
		modifyRspackConfig(async ({module}) => {
			module = module || {}
			module.rules = module.rules || []
			
			//const fusionLoaderPath = resolve(localDirectory, "loaders", "fusionLoader.js")
			const fusionLoaderPath = await Bun.resolve("./loaders/fusionLoader.js", import.meta.dirname)
			
			if(!fusionLoaderPath) {
				logger.error(`${fusionLoaderPath} was not found`)
				process.exit(1)
			}
			
			// FIX: Isolate this rule strictly to server files and use 'post' enforcement
			// so it intercepts the files before standard transpilation kicks in.
			module.rules.push({
				test: /\.server\.ts$/,
				exclude: /node_modules/,
				enforce: "post",
				use: [
					{
						loader: fusionLoaderPath,
					},
				],
			})
		})
		
		onBeforeStartDevServer(({server}) => {
			server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> => {
				const url = new URL(req.url || "/", `http://${req.headers.host}`)
				
				if(!url.pathname.startsWith("/fusion/rpc")) {
					return next()
				}
				
				const filePath = url.searchParams.get("file")
				const targetMethod = url.searchParams.get("method")
				
				if(!filePath || !targetMethod) {
					res.statusCode = 400
					res.end("Missing RPC query parameters")
					return
				}
				
				const bodyBuffers: Uint8Array[] = []
				
				req.on("data", (chunk) => bodyBuffers.push(chunk))
				req.on("end", async () => {
					try {
						const rawBodyText = Buffer.concat(bodyBuffers).toString("utf-8")
						const args = JSON.parse(rawBodyText || "[]") as unknown[]
						
						// Standard, native ESM dynamic import - zero background map lookups required
						const serverModule = await import(filePath)
						const targetFunction = serverModule[targetMethod]
						
						if(typeof targetFunction !== "function") {
							throw new TypeError(`Export '${targetMethod}' in ${filePath} is not an executable function.`)
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
							},
						}))
					}
				})
			})
		})
		
		onCloseBuild(async () => {
			// Return if the "command" is not "build"
			if(context.action !== "build") {
				return
			}
			logger.start("Starting build process")
			
			// Path to dist/
			const prodDistPath = context.distPath
			
			logger.info(`-> Found ${productionFnManifest.size} server functions`)
			
			if(existsSync(prodDistPath)) {
				// Use simple relative string entries to capture complete subdirectory paths
				const prodDistEntries = await readdir(prodDistPath, {recursive: true}) as string[]
				
				for(const entry of prodDistEntries) {
					const assetAbsolutePath = resolve(prodDistPath, entry)
					
					// Ignore subdirectories in the file tree
					if((await stat(assetAbsolutePath)).isDirectory()) {
						continue
					}
					
					// Faster directory exclusion check than regex splitting on every item
					if(assetAbsolutePath.includes("/server-fn")) {
						continue
					}
					
					const relativePath = relative(prodDistPath, assetAbsolutePath)
					
					const fileBuffer = await Bun.file(assetAbsolutePath).arrayBuffer()
					
					let bytes = new Uint8Array(fileBuffer)
					
					const ext = entry.slice(entry.lastIndexOf("."))
					
					const isAsset = [".html", ".js", ".css", ".svg", ".json"].includes(ext)
					
					if(isAsset) {
						bytes = Bun.gzipSync(bytes)
					}
					
					// Convert bytes directly to a safe base64 string for JSON insertion
					const base64Content = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64")
					clientAssets[`/${relativePath}`] = {
						content: base64Content,
						isGzip: isAsset,
					}
				}
			}
			// Placeholder for dynamically injected import statements
			const msImports = new MagicString("")
			
			const serverFnOutputDir = `${prodDistPath}/server-fn`
			
			await mkdir(serverFnOutputDir, {recursive: true})
			
			for(const [serverFnId, srcFilePath] of productionFnManifest.entries()) {
				
				const serverFn = await Bun.file(srcFilePath).text()
				
				const transpiledServerFn = rspack.experiments.swc.transformSync(serverFn, {
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
				// "fn_13307412_getHomeDir" -> removes everything up to the final underscore index
				const hashEndIndex = serverFnId.lastIndexOf("_")
				msServerFnId.remove(0, hashEndIndex + 1)
				
				await Bun.write(`${serverFnOutputDir}/${serverFnId}.js`, transpiledServerFn)
				
				msImports.append(`import {${msServerFnId.toString()}} from "./server-fn/${serverFnId}"\nrpcFunctions.set("${serverFnId}", ${msServerFnId.toString()})\n`)
			}
			
			const serverEngineTemplate = resolve(localDirectory, "templates", "serverEngine.js")
			
			if(!existsSync(serverEngineTemplate)) {
				logger.error(`${serverEngineTemplate} not found`)
				process.exit(1)
			}
			
			const serverEngineCode = await Bun.file(serverEngineTemplate).text()
			
			const msServerCode = new MagicString(serverEngineCode)
			
			const clientAssetsPlaceholder = "__CLIENT_ASSETS_INJECTION_TOKEN__"
			// Find the exact index position of `__CLIENT_ASSETS_INJECTION_TOKEN__` text markers
			const clientAssetIdx = serverEngineCode.indexOf(clientAssetsPlaceholder)
			
			if(clientAssetIdx !== -1) {
				const assetPayloadString = `\nclientAssets = ${JSON.stringify(clientAssets)}\n`
				// Overwrite the explicit boundaries from token start to token end to prevent drift corruption!
				msServerCode.overwrite(clientAssetIdx, clientAssetIdx + clientAssetsPlaceholder.length, assetPayloadString)
			}
			else {
				logger.error("[Plugin] Error: Client assets token placeholder missing")
				process.exit(1)
			}
			
			const serverFnsPlaceholder = "__SERVER_FUNCTIONS_INJECTION_TOKEN__"
			// Find the exact index position of `__SERVER_FUNCTIONS_INJECTION_TOKEN__` text markers
			const serverFnIdx = serverEngineCode.indexOf(serverFnsPlaceholder)
			
			if(serverFnIdx !== -1) {
				// Overwrite the explicit boundaries from token start to token end
				msServerCode.overwrite(serverFnIdx, serverFnIdx + serverFnsPlaceholder.length, msImports.toString())
			}
			else {
				logger.error("[Plugin] Error: RPC token placeholder missing")
				process.exit(1)
			}
			
			const indexFile = resolve(prodDistPath, "index.js")
			
			await Bun.write(indexFile, msServerCode.toString())
			
			logger.success(`Build artifacts written to ${prodDistPath}`)
		})
	},
})