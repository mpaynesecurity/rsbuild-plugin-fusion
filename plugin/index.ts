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
import MagicString from "magic-string"
import { existsSync } from "node:fs"
import { mkdir, readdir } from "node:fs/promises"
import { type IncomingMessage, type ServerResponse } from "node:http"
import { dirname, extname, join, resolve } from "node:path"
import { normalizePath } from "./helpers"
import {
	clientAssets,
	localRpcFunctions,
	productionRpcManifest,
	type NextFunction,
	type SafeRequest,
	type ServerAction,
	type RpcLoaderOptions,
} from "./types"

/**
 * @example
 * const getHomeDirectory = useServerAction$(async () => {
 * 	return (await (import("node:os"))).homedir()
 * })
 *
 * @example
 * ### Improper Variable Scoping
 * ```tsx
 * // Ensure variables are declared within the closure!
 * const secretSalt = "xyz123"
 *
 * const myAction = serverAction$(async () => {
 * 	// ReferenceError: secretSalt is not defined since the variable is outside the closure's scope
 * 	return doSomething(secretSalt)
 * })
 * ```
 *
 * @example
 * ### With Arguments
 *
 * Note: Any data type that can survive standard JSON.stringify() and JSON.parse() cycles will pass through seamlessly
 *
 * 1. Strings, Numbers, and Booleans
 * 2. Plain objects (e.g., { name: "John", roles: ["admin"] })
 * 3. Standard arrays
 
 * ```tsx
 * const readCustomDir = useServerAction$(async (subFolder: string) => {
 * 	const os = await import("node:os")
 * 	const path = await import("node:path")
 * 	return path.join(os.homedir(), subFolder)
 * })
 * ```
 *
 * @example
 * ### Binary Uploads
 *
 * Note: Node’s native Request constructor has an internal threshold for incoming form streams depending on your precise runtime
 * environment version flags.
 * ```tsx
 * export const uploadTextFile = useServerAction$(async (file: File) => {
 * 	// Read text files instantly
 * 	const textContent = await file.text()
 *
 * 	// Read binary chunks (images/zips) into a Node Buffer natively
 * 	const arrayBuffer = await file.arrayBuffer()
 * 	const nodeBuffer = Buffer.from(arrayBuffer)
 *
 * 	return { name: file.name, size: file.size }
 * })
 * ```
 * @see ServerAction
 */
export let useServerAction$: ServerAction

const filename = Bun.fileURLToPath(import.meta.url)

const localDirectory = dirname(filename)

export const fusionPlugin = (): RsbuildPlugin => ({
	name: "fusion",
	setup(api) {
		api.modifyRspackConfig((config, {env}) => {
			const isBuild = env === "production"
			
			config.module = config.module || {}
			config.module.rules = config.module.rules || []
			
			const loaderOptions: RpcLoaderOptions = {
				isBuild,
				productionRpcManifest,
				localRpcFunctions,
			}
			
			// Construct a url path to the rpcMacroLoader file
			const rpcMacroLoaderFile = resolve(localDirectory, "loaders", "rpcMacroLoader.js")
			
			if(!rpcMacroLoaderFile) {
				console.error(`${rpcMacroLoaderFile} was not found`)
				process.exit(1)
			}
			
			config.module.rules.push({
				test: /\.(tsx|jsx|svelte|vue|ts)$/,
				exclude: "node_modules",
				use: [
					{
						loader: rpcMacroLoaderFile,
						options: loaderOptions,
					},
				],
			})
		})
		
		api.onBeforeStartDevServer(({server}) => {
			server.middlewares.use(async (req: IncomingMessage, res: ServerResponse<IncomingMessage>, next: NextFunction) => {
				const url = new URL(req.url || "/", `http://${req.headers.host}`), pathname = url.pathname
				// Intercept calls to the hidden api endpoint.
				if(pathname.startsWith("/fusion/rpc")) {
					// Extract the id of the rpc function
					const id = url.searchParams?.get("id")
					
					// Return an HTTP not found code if the rpc function's id is not in the map.
					if(!id || !localRpcFunctions.has(id)) {
						res.statusCode = 404
						return res.end("RPC function ID not found")
					}
					
					try {
						// Check if the HTTP method allows a request body (GET/HEAD will throw if body is present)
						const hasBody = !["GET", "HEAD"].includes(req.method || "")
						
						// Build ReadableStream directly from the Node request iterator
						const webBody = hasBody
						                ? new ReadableStream({
								async start(controller) {
									for await (const chunk of req) {
										controller.enqueue(new Uint8Array(chunk))
									}
									controller.close()
								},
							}) : undefined
						
						// Map raw Node message sockets directly to native request engines to extract Form Data streams
						const protocol = req.headers["x-forwarded-proto"] || "http"
						
						const webReq = new Request(new URL(req.url || "", `${protocol}://${req.headers.host}`), {
							method: req.method,
							headers: req.headers as Record<string, string>,
							body: hasBody ? webBody : undefined,
							// @ts-ignore - Explicitly allow duplex connection for standard streaming targets. Needed for Node versions requiring duplex flag for streaming bodies
							duplex: webBody ? "half" : undefined,
						})
						
						// Extract the forData object from the incoming request
						const formData: FormData = await (webReq as SafeRequest).formData()
						const args: any[] = []
						
						// Starting point for appending 0, 1, 2... to the extracted FormData arguments (arg)
						let i = 0
						
						/*
						 * The Key Renaming Scheme:
						 * A FormData object is a flat list of key-value pairs (like dictionary entries).
						 * It has no concept of order or indexing like a regular JavaScript array.
						 *
						 * To send an array over a form, the sender renames the items sequentially: arg_0, arg_1, arg_2, then use
						 * a `while` loop to increments i (0, 1, 2...) to dynamically scan for those exact key names in order,
						 * rebuilding the array sequence piece by piece until it hits a number that doesn't exist.
						 */
						while(formData.has(`arg_${i}`)) {
							const val: FormDataEntryValue | null = formData.get(`arg_${i}`)
							/*
							 * Splitting Files From Text:
							 * A form field value can either be a standard text string or a raw binary file upload (like an image or a PDF),
							 * meaning we need to separate them. If the value is a native browser File object, we skip all processing and push
							 *  the raw file directly into the final args array.
							 */
							if(val instanceof File) {
								args.push(val)
							}
							/*
							 * The Double-Parsing Text Trap:
							 * Because everything that isn't a file must be sent as a string over HTTP,
							 * the sender has to turn complex structures like objects `{ name: "John" }` or booleans
							 * into text strings using JSON.stringify(). But plain words (like "hello") are also strings.
							 *
							 * Since we don't know which string is a JSON string and which is just a regular plain-text word,
							 * we drop everything into a try/catch block and run JSON.parse() to achieve the following;
							 *
							 * 1. Stringified object or boolean --> JSON.parse() succeeds and restores it to a real object or primitive.
							 *
							 * 2: Regular word like "hello" --> JSON.parse() crashes, triggers the catch block, and the code falls back to pushing it as raw text.
							 */
							else if(typeof val === "string") {
								try {
									args.push(JSON.parse(val))
								}
								catch {
									args.push(val)
								}
							}
							i++
						}
						
						const result = await localRpcFunctions.get(id)!(...args)
						res.writeHead(200, {"Content-Type": "application/json"})
						return res.end(JSON.stringify({result}))
					}
					catch(err) {
						res.statusCode = 500
						res.writeHead(500, {"Content-Type": "application/json"})
						return res.end(JSON.stringify({error: err}))
					}
				}
				next()
			})
		})
		
		api.onCloseBuild(async () => {
			// Return if the "command" is not "build"
			if(api.context.action !== "build") {
				return
			}
			const outDirPath = resolve(api.context.rootPath, api.context.distPath)
			
			if(existsSync(outDirPath)) {
				const entries = await readdir(outDirPath, {recursive: true, withFileTypes: true})
				
				for(const entry of entries) {
					// skip any subdirectories
					if(entry.isDirectory()) {
						continue
					}
					
					const f = join(entry.parentPath, entry.name).replace(outDirPath, "").replace(/^[\\/]/, "")
					
					// Do not scrape the `rpc` directory
					if(f.split(/[\\/]/).includes("rpc")) {
						continue
					}
					
					const filePath = join(outDirPath, f)
					//const url = "/" + f.replace(/\\/g, "/")
					
					const url = `/${normalizePath(f)}`
					const ext = extname(f)
					const isBin = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2"].includes(ext)
					
					if(!isBin) {
						const rawContent = await Bun.file(filePath).text()
						
						// Bun.gzipSync returns a Uint8Array. Buffer.from() casts it to convert it to base64.
						// Byte conversion without buffer allocation leakage.
						const base64Content = Buffer.from(Bun.gzipSync(Buffer.from(rawContent))).toString("base64")
						
						clientAssets[url] = {content: base64Content, isGzip: true}
					}
					else {
						const rawBytes: Uint8Array<ArrayBuffer> = new Uint8Array(await Bun.file(filePath).arrayBuffer())
						
						clientAssets[url] = {bytes: [...rawBytes], isGzip: false}
					}
				}
			}
			
			const rpcLines = new MagicString("")
			
			const rpcOutputDir = resolve(outDirPath, "rpc")
			
			// Create the `rpc` directory inside the dist folder
			if(!existsSync(rpcOutputDir)) {
				await mkdir(rpcOutputDir, {recursive: true})
			}
			
			// Loop the routes sequentially to avoid async writing race conditions
			for(const [id, src] of productionRpcManifest.entries()) {
				const rpcFileName = `${id}.mjs`
				const rpcFilePath = resolve(rpcOutputDir, rpcFileName)
				const fileContent = `export default ${src}`
				
				await Bun.write(rpcFilePath, fileContent)
				
				// Inject a static relative import block into the main server file
				rpcLines.append(`import rpc_${id} from "./rpc/${rpcFileName}"\nrpcFunctions.set("${id}", rpc_${id})\n`)
			}
			
			const serverEngineTemplate = resolve(localDirectory, "templates", "serverEngine.js")
			
			if(!existsSync(serverEngineTemplate)) {
				console.error(`${serverEngineTemplate} not found`)
				process.exit(1)
			}
			
			const serverEngineCode = await Bun.file(serverEngineTemplate).text()
			
			const msServerCode = new MagicString(serverEngineCode)
			
			const rpcToken = `/*!__RPC_FUNCTIONS_INJECTION_TOKEN__*/`
			const assetToken = `/*!__CLIENT_ASSETS_INJECTION_TOKEN__*/`
			
			const rpcIdx = serverEngineCode.indexOf(rpcToken)
			
			const assetIdx = serverEngineCode.indexOf(assetToken)
			
			if(assetIdx !== -1) {
				const assetPayloadString = `\nclientAssets = ${JSON.stringify(clientAssets, null, 2)}\n`
				msServerCode.replace(assetToken, assetPayloadString)
			}
			else {
				console.error("[Plugin] Error: CLIENT_ASSETS injection token placeholder missing in serverEngine")
				process.exit(1)
			}
			
			if(rpcIdx !== -1) {
				msServerCode.replace(rpcToken, rpcLines.toString())
			}
			else {
				console.error("[Plugin] Error: RPC injection token placeholder missing in serverEngine")
				process.exit(1)
			}
			
			const indexFile = resolve(outDirPath, "index.mjs")
			
			await Bun.write(indexFile, msServerCode.toString())
		})
	},
})
