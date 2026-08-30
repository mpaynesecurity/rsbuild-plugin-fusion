import { type RsbuildPlugin } from "@rsbuild/core"
import MagicString from "magic-string"
import { existsSync } from "node:fs"
import { mkdir, readdir, stat } from "node:fs/promises"
import { type IncomingMessage, type ServerResponse } from "node:http"
import { dirname, extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { type RpcLoaderOptions } from "./rpcMacroLoader"

/**
 * Modifies the standard JavaScript/TypeScript Request object and ensures that calling .formData() always
 * returns a valid FormData object wrapped in a Promise, eliminating the default TypeScript possibility that
 * it might return unknown or cause type errors.
 */
type SafeRequest = Omit<Request, "formData"> & {
	formData(): Promise<FormData>
}

/**
 * @type {(err?: any) => void}
 */
type NextFunction = (err?: any) => void

/**
 * Module-scoped map registry tracks live actions during development
 *
 * @type {Map<string, Function>}
 */
const localRpcFunctions: Map<string, Function> = new Map<string, Function>()

/**
 * Registry map which holds the compiled production rpc function calls
 *
 * @type {Map<string, string>}
 */
const productionRpcManifest: Map<string, string> = new Map<string, string>()

/**
 * Define the "contract" for what a ServerAction call looks like
 */
export type ServerAction = <Args extends any[], Return>(
	fn: (...args: Args) => Return | Promise<Return>,
) => (...args: Args) => Promise<Awaited<Return>>


/**
 * @example
 * const getHomeDirectory = useServerAction$(async () => {
 * 	return (await (import("node:os"))).homedir()
 * })
 *
 * @example
 * ### Improper Variable Scoping
 * ```tsx
 * import { useServerAction$ } from "@mpaynesecurity/fusion"
 
 * // Ensure variables are declared within the closure!
 * const secretSalt = "xyz123"
 *
 * const myAction = serverAction$(async () => {
 * 	// 💥 ReferenceError: secretSalt is not defined since the variable is outside the closure's scope
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
 * import { useServerAction$ } from "@mpaynesecurity/fusion"
 *
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
 * import { useServerAction$ } from "@mpaynesecurity/fusion"
 *
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

/**
 *
 * @returns {RsbuildPlugin}
 */
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
			const rpcMacroLoaderFile = fileURLToPath(new URL("./rpcMacroLoader.js", import.meta.url))
			
			if(!rpcMacroLoaderFile) {
				console.error(`${rpcMacroLoaderFile} was not found`)
				process.exit(1)
			}
			
			config.module.rules.push({
				test: /\.(tsx|jsx|svelte|vue|ts)$/,
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
					
					// Return an HTTP not found code if the rpc function's id is not in the set.
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
						
						// Map raw Node message sockets directly to native Request engines to extract Form Data streams
						const protocol = req.headers["x-forwarded-proto"] || "http"
						
						const webReq = new Request(new URL(req.url || "", `${protocol}://${req.headers.host}`), {
							method: req.method,
							headers: req.headers as Record<string, string>,
							body: hasBody ? webBody : undefined,
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
			if(api.context.action !== "build") {
				return
			}
			const outDirPath = resolve(api.context.rootPath, api.context.distPath)
			const clientAssets: Record<
				string,
				| {content: string; isGzip: true}
				| {bytes: number[]; isGzip: false}
			> = {}
			
			const scrape = async (dir: string) => {
				if(!existsSync(dir)) {
					return
				}
				
				const files = await readdir(dir)
				
				for(const f of files) {
					const filePath = join(dir, f)
					
					if(!existsSync(filePath)) {
						continue
					}
					
					const fileStat = await stat(filePath)
					
					if(fileStat.isDirectory()) {
						// Don't scape rpc directory
						if(f === "rpc") {
							continue
						}
						await scrape(filePath)
					}
					else {
						const url = "/" + relative(outDirPath, filePath).replace(/\\/g, "/"), ext = extname(f)
						const isBin = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2"].includes(ext)
						
						if(!isBin) {
							const rawContent = await Bun.file(filePath).text()
							
							const base64Content = Bun.gzipSync(rawContent).toBase64({alphabet: "base64"}).toString()
							
							clientAssets[url] = {content: base64Content, isGzip: true}
						}
						else {
							const byteArray = Array.from(new Uint8Array(await Bun.file(filePath).arrayBuffer()))
							
							clientAssets[url] = {bytes: byteArray, isGzip: false}
						}
					}
				}
			}
			await scrape(outDirPath)
			const rpcLines = new MagicString("")
			const rpcOutputDir = resolve(outDirPath, "rpc")
			
			// Create the target rpc directory inside the dist folder
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
			
			const filename = Bun.fileURLToPath(import.meta.url)
			const localDirectory = dirname(filename)
			
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
