let clientAssets: Record<string, {isGzip: boolean; content: string}> = {}

const __rpcFunctions = new Map<string, (...args: any[]) => any>()

/*!__RPC_FUNCTIONS_INJECTION_TOKEN__*/

const ASSETS = JSON.parse(JSON.stringify(clientAssets))

/*!__CLIENT_ASSETS_INJECTION_TOKEN__*/

const MIME: Record<string, string> = {
	"html": "text/html",
	"css": "text/css",
	"js": "text/javascript",
	"json": "application/json",
}

const base64ToUint8 = (base64: string): Uint8Array => {
	const binaryString = atob(base64)
	const len = binaryString.length
	const bytes = new Uint8Array(len)
	for(let i = 0; i < len; i++) {
		bytes[i] = binaryString.charCodeAt(i)
	}
	return bytes
}

/**
 * Stream decompress directly via standard blobs instead of double Response shells
 * @param {Uint8Array} uint8Array
 * @returns {Promise<Uint8Array>}
 */
const gunzipWeb = async (uint8Array: Uint8Array): Promise<Uint8Array> => {
	// Extract the underlying buffer and tell TS strictly that it's a standard ArrayBuffer
	const rawBuffer = uint8Array.buffer as ArrayBuffer
	
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(rawBuffer)
			controller.close()
		},
	}).pipeThrough(new DecompressionStream("gzip"))
	
	const response = new Response(stream)
	const buffer = await response.arrayBuffer()
	return new Uint8Array(buffer)
}
//endregion

//region Pre Compilation
// Maps out the entries from configuration target
const DECODED_ASSETS = Object.entries(ASSETS).reduce((acc, [key, asset]: [string, any]) => {
	acc[key] = {
		isGzip: !!asset.isGzip,
		bytes: base64ToUint8(asset.content || ""),
	}
	return acc
}, {} as Record<string, {isGzip: boolean; bytes: Uint8Array}>)
//endregion

//region Modern Runtimes
// This runs on "Modern" platforms such as Cloudflare Workers, Vercel, etc
const serverEngine = {
	async fetch(req: Request) {
		const url = new URL(req.url)
		let pathname = url.pathname === "/" ? "/index.html" : url.pathname
		
		// ─── RPC GATEWAY ───
		if(pathname.startsWith("/api/rpc")) {
			const id = url.searchParams.get("id")
			if(!id || !__rpcFunctions.has(id)) return new Response(null, {status: 404})
			
			try {
				const formData = await req.formData()
				const args = []
				let i = 0
				
				while(formData.has(`arg_${i}`)) {
					const val = formData.get(`arg_${i}`)
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
				
				const rpcFn = __rpcFunctions.get(id)!
				const result = await rpcFn(...args)
				
				return new Response(JSON.stringify({result}), {
					status: 200,
					headers: {"Content-Type": "application/json"},
				})
			}
			catch(err) {
				console.error(`[RPC Error] ID ${id}:`, err)
				return new Response(JSON.stringify({error: "Internal Server Error"}), {
					status: 500,
					headers: {"Content-Type": "application/json"},
				})
			}
		}
		
		// Asset router
		let asset = DECODED_ASSETS[pathname]
		if(!asset && DECODED_ASSETS["/index.html"]) {
			pathname = "/index.html"
			asset = DECODED_ASSETS["/index.html"]
		}
		
		if(asset) {
			const acceptEncoding = req.headers.get("accept-encoding") || ""
			const lastDot = pathname.lastIndexOf(".")
			const ext = lastDot !== -1 ? pathname.substring(lastDot + 1) : ""
			const contentType = MIME[ext] || "application/octet-stream"
			const cacheControl = pathname === "/index.html" ? "no-cache" : "public, max-age=31536000, immutable"
			
			const compressedBytes = asset.bytes
			
			if(asset.isGzip && acceptEncoding.includes("gzip")) {
				const body = compressedBytes.buffer as ArrayBuffer // Clean standard memory block
				return new Response(body, {
					status: 200,
					headers: {
						"Content-Type": contentType,
						"Content-Encoding": "gzip",
						"Cache-Control": cacheControl,
					},
				})
			}
			
			const rawBytes = asset.isGzip ? await gunzipWeb(compressedBytes) : compressedBytes
			const body = rawBytes.buffer as ArrayBuffer
			
			return new Response(body, {
				status: 200,
				headers: {
					"Content-Type": contentType,
					"Cache-Control": cacheControl,
				},
			})
		}
		return new Response(null, {status: 404})
	},
}

export default serverEngine
//endregion

/*
 //region Legacy Adapter
 // This fires up ONLY if running inside standard Node.js environment
 if(runtime === "node") {
 import("node:http").then((http) => {
 http.createServer(async (nodeReq, nodeRes) => {
 try {
 const protocol = (nodeReq.headers["x-forwarded-proto"] as string) || "http"
 const host = nodeReq.headers.host || "localhost:3000"
 
 // Map and stringify headers to satisfy strict Web API formats
 const webHeaders = new Headers()
 for(const [key, value] of Object.entries(nodeReq.headers)) {
 if(value === undefined) continue
 if(Array.isArray(value)) {
 for(const val of value) {
 webHeaders.append(key, val)
 }
 }
 else {
 webHeaders.set(key, value)
 }
 }
 
 // Adapt legacy Node stream chunks into a modern Web ReadableStream
 let webBody: ReadableStream | undefined = undefined
 if(nodeReq.method !== "GET" && nodeReq.method !== "HEAD") {
 webBody = new ReadableStream({
 start(controller) {
 nodeReq.on("data", (chunk) => controller.enqueue(chunk))
 nodeReq.on("end", () => controller.close())
 nodeReq.on("error", (err) => controller.error(err))
 },
 })
 }
 
 // Construct the web standard request layout
 const webReq = new Request(new URL(nodeReq.url || "", `${protocol}://${host}`), {
 method: nodeReq.method,
 headers: webHeaders,
 body: webBody,
 // @ts-ignore - Explicitly allow duplex connection for standard streaming targets.
 // Needed for Node versions requiring duplex flag for streaming bodies
 duplex: webBody ? "half" : undefined,
 })
 
 const webRes = await serverEngine.fetch(webReq)
 
 // Write headers back cleanly
 nodeRes.statusCode = webRes.status
 webRes.headers.forEach((value, key) => {
 // Use append to safely preserve multi-value headers like set-cookie
 nodeRes.appendHeader?.(key, value) || nodeRes.setHeader(key, value)
 })
 
 // Stream the response buffer directly out the door
 const arrayBuffer = await webRes.arrayBuffer()
 nodeRes.end(new Uint8Array(arrayBuffer))
 }
 catch(e) {
 console.error("[Bridge Crash]:", e)
 nodeRes.statusCode = 500
 nodeRes.end("Internal Bridge Error")
 }
 }).listen(process.env.PORT || 3000)
 console.log("Application active via Node.js bridge on http://localhost:" + (process.env.PORT || 3000))
 })
 }
 //endregion
 */