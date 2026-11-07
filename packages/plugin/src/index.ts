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
import { createHash } from "node:crypto"
import { type RsbuildPlugin } from "@rsbuild/core"
import MagicString from "magic-string"
import { existsSync } from "node:fs"
import { mkdir, readdir, stat, rm } from "node:fs/promises"
import { dirname, posix, resolve } from "node:path"

const clientAssets: Record<string, {content: string; isGzip: boolean, bytes?: number[]}> = {}

const filename = Bun.fileURLToPath(import.meta.url)

const localDirectory = dirname(filename)

export const fusionPlugin = (): RsbuildPlugin => ({
	name: "fusion",
	enforce: "pre",
	setup({logger, modifyRspackConfig, onBeforeStartDevServer, onCloseBuild, context}) {
		
		modifyRspackConfig((config) => {
			config.module = config.module || {}
			config.module.rules = config.module.rules || []
			
			const rpcMacroLoaderFile = resolve(localDirectory, "loaders", "rpcMacroLoader.js")
			
			if(!rpcMacroLoaderFile) {
				console.error(`${rpcMacroLoaderFile} was not found`)
				process.exit(1)
			}
			
			config.module.rules.push({
				test: /\.(tsx|jsx|svelte|vue|ts)$/,
				exclude: /node_modules/,
				enforce: "pre",
				use: [
					{
						loader: rpcMacroLoaderFile,
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
			
			const normalizedOutputPath = resolve(context.rootPath, context.distPath).replace(/\\/g, "/")
			
			const rpcLines = new MagicString("")
			const rpcOutputDir = resolve(normalizedOutputPath, "rpc")
			
			if(!existsSync(rpcOutputDir)) {
				await mkdir(rpcOutputDir, {recursive: true})
			}
			
			const transpiler = new Bun.Transpiler({loader: "ts"})
			const compiledFiles = new Set<string>()
			
			// STEP 1: Process the virtual intermediate modules serialized natively by Rspack's asset pool
			const intermediateDir = resolve(normalizedOutputPath, ".fusion-internal")
			
			if(existsSync(intermediateDir)) {
				const internalMetaFiles = await readdir(intermediateDir)
				
				for(const metaFile of internalMetaFiles) {
					if(!metaFile.endsWith(".json")) continue
					
					const metaFilePath = resolve(intermediateDir, metaFile)
					const metaData = JSON.parse(await Bun.file(metaFilePath).text())
					
					const {rpcId, filePath, exports, originalFileCode} = metaData
					
					// FIX 1: Safely compute an anonymous file-level identifier hash from the original filePath context
					// This completely guarantees your local machine paths are stripped from the code strings!
					const fileHash = createHash("sha256").update(filePath).digest("hex").slice(0, 8)
					const cleanFileToken = `fn_${fileHash}`
					
					const rawRpcFileName = `${cleanFileToken}.raw.js`
					const rpcRawFilePath = resolve(rpcOutputDir, rawRpcFileName)
					const bridgeRpcFileName = `${cleanFileToken}.js`
					const rpcBridgeFilePath = resolve(rpcOutputDir, bridgeRpcFileName)
					
					if(!compiledFiles.has(filePath)) {
						const vanillaJsContent = transpiler.transformSync(originalFileCode)
						const cleanProductionServerCode = vanillaJsContent
							.replace(/"use fusion";?\s*/g, "")
							.replace(/'use fusion';?\s*/g, "")
						
						await Bun.write(rpcRawFilePath, cleanProductionServerCode.trim())
						compiledFiles.add(filePath)
					}
					
					const exportLines = exports.join(", ")
					
					const bridgeContent = `export { ${exportLines} } from "./${rawRpcFileName}";`
					
					await Bun.write(rpcBridgeFilePath, bridgeContent)
					
					for(const name of exports) {
						// FIX 2: Reconstruct the exact unique production token using the clean anonymous file token hash
						const uniqueProductionToken = `${cleanFileToken}_${name}`
						
						// FIX 3: Inject the short, path-free variable name identifiers into the server template setup mapping
						rpcLines.append(`import * as ${uniqueProductionToken}_mod from "./rpc/${bridgeRpcFileName}"\nrpcFunctions.set("${uniqueProductionToken}", ${uniqueProductionToken}_mod.${name})\n`)
					}
					
					// Erase the temporary tracking artifact
					await rm(metaFilePath)
				}
				await rm(intermediateDir, {recursive: true, force: true})
			}
			
			// STEP 2: Standard clientAssets gathering compression pass loop
			if(existsSync(normalizedOutputPath)) {
				const relativeEntries = await readdir(normalizedOutputPath, {recursive: true}) as string[]
				for(const relativeEntry of relativeEntries) {
					const assetAbsolutePath = resolve(normalizedOutputPath, relativeEntry)
					const assetNormalizedPath = assetAbsolutePath.replace(/\\/g, "/")
					
					if((await stat(assetAbsolutePath)).isDirectory() || assetNormalizedPath.includes("/rpc") || assetNormalizedPath.includes(".fusion-internal")) {
						continue
					}
					
					const relativePath = posix.relative(normalizedOutputPath, assetNormalizedPath)
					const url = `/${relativePath}`
					const fileBuffer = await Bun.file(assetAbsolutePath).arrayBuffer()
					
					let bytes = new Uint8Array(fileBuffer)
					const ext = relativeEntry.slice(relativeEntry.lastIndexOf("."))
					const isText = [".html", ".js", ".css", ".svg", ".json"].includes(ext)
					
					if(isText) {
						bytes = Bun.gzipSync(bytes)
					}
					const base64Content = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64")
					clientAssets[url] = {
						content: base64Content,
						isGzip: isText,
					}
				}
			}
			
			const serverEngineTemplate = resolve(localDirectory, "templates", "serverEngine.js")
			
			if(!existsSync(serverEngineTemplate)) {
				logger.error(`${serverEngineTemplate} not found`)
				process.exit(1)
			}
			
			const serverEngineCode = await Bun.file(serverEngineTemplate).text()
			const msServerCode = new MagicString(serverEngineCode)
			
			const assetToken = "__CLIENT_ASSETS_INJECTION_TOKEN__"
			const rpcToken = "__RPC_FUNCTIONS_INJECTION_TOKEN__"
			
			const rpcIdx = serverEngineCode.indexOf(rpcToken)
			const assetIdx = serverEngineCode.indexOf(assetToken)
			
			if(assetIdx !== -1) {
				const assetPayloadString = `\nclientAssets = ${JSON.stringify(clientAssets)}\n`
				msServerCode.overwrite(assetIdx, assetIdx + assetToken.length, assetPayloadString)
			}
			if(rpcIdx !== -1) {
				msServerCode.overwrite(rpcIdx, rpcIdx + rpcToken.length, rpcLines.toString())
			}
			
			const indexFile = resolve(normalizedOutputPath, "index.js")
			await Bun.write(indexFile, msServerCode.toString())
			logger.success(`Build artifacts written to ${normalizedOutputPath}`)
		})
		
		
	},
})