import type { RsbuildPlugin } from "@rsbuild/core"
import MagicString from "magic-string"
import { existsSync } from "node:fs"
import { mkdir, readdir, stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, extname, join, relative, resolve } from "node:path"
import { type RpcLoaderOptions } from "./rpcMacroLoader"

type SafeRequest = Omit<Request, "formData"> & {
	formData(): Promise<FormData>
}


/**
 * Module-scoped map registry tracks live actions during development
 * @type {Map<string, Function>}
 */
const localRpcFunctions: Map<string, Function> = new Map<string, Function>()

/**
 * Registry which holds the compiled rpc function calls
 * @type {Map<string, string>}
 */
const productionRpcManifest: Map<string, string> = new Map<string, string>()

/**
 * Define the "contract" for what a ServerAction call looks like
 */
export type ServerAction = <Args extends any[], Return>(
	fn: (...args: Args) => Return | Promise<Return>,
) => (...args: Args) => Promise<Awaited<Return>>

export let useServerAction$: ServerAction

//index.ts
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
			
			const rpcMacroLoaderFile = fileURLToPath(new URL("./rpcMacroLoader.js", import.meta.url))
			
			config.module.rules.push({
				test: /\.(tsx|jsx|svelte|vue)$/,
				use: [
					{
						loader: rpcMacroLoaderFile,
						options: loaderOptions,
					},
				],
			})
		})
		
		api.onBeforeStartDevServer(({server}) => {
			server.middlewares.use(async (req, res, next) => {
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
						
						const formData: FormData = await (webReq as SafeRequest).formData()
						const args: any[] = []
						
						let i = 0
						
						while(formData.has(`arg_${i}`)) {
							const val: FormDataEntryValue | null = formData.get(`arg_${i}`)
							if(val instanceof File) {
								args.push(val)
							}
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
				rpcLines.append(`import rpc_${id} from "./rpc/${rpcFileName}"\n__rpcFunctions.set("${id}", rpc_${id})\n`)
			}
			
			const filename = Bun.fileURLToPath(import.meta.url)
			const localDirectory = dirname(filename)
			
			const absoluteServerCodePath = resolve(localDirectory, "serverEngine.js")
			
			if(!existsSync(absoluteServerCodePath)) {
				console.error(`${absoluteServerCodePath} not found`)
				process.exit(1)
			}
			
			const serverEngineCode = await Bun.file(absoluteServerCodePath).text()
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
