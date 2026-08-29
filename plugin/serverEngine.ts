let clientAssets: Record<string, {isGzip: boolean; content?: string; bytes?: number[]}> = {}

const __rpcFunctions = new Map<string, (...args: any[]) => any>()

/*!__RPC_FUNCTIONS_INJECTION_TOKEN__*/

/*!__CLIENT_ASSETS_INJECTION_TOKEN__*/

const ASSETS = JSON.parse(JSON.stringify(clientAssets))

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

const gunzipWeb = async (uint8Array: Uint8Array): Promise<Uint8Array> => {
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

const DECODED_ASSETS = Object.entries(ASSETS).reduce((acc, [key, asset]: [string, any]) => {
	acc[key] = {
		isGzip: !!asset.isGzip,
		bytes: asset.isGzip && asset.content
		       ? base64ToUint8(asset.content)
		       : new Uint8Array(asset.bytes || []),
	}
	return acc
}, {} as Record<string, {isGzip: boolean; bytes: Uint8Array}>)

const serverEngine = {
	async fetch(req: Request) {
		const url = new URL(req.url)
		let pathname = url.pathname === "/" ? "/index.html" : url.pathname
		
		// Normalized pathname to prevent double-slash bypass traps (e.g. "//api/rpc")
		const cleanPath = pathname.replace(/\/+/g, "/")
		
		// ─── RPC GATEWAY ───
		if(cleanPath.startsWith("/fusion/rpc")) {
			const id = url.searchParams.get("id")
			if(!id || !__rpcFunctions.has(id)) {
				return new Response(JSON.stringify({error: `RPC Route Not Found: ${id || "missing id"}`}), {
					status: 404,
					headers: {"Content-Type": "application/json"},
				})
			}
			
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
		
		// ─── ASSET ROUTER ───
		let asset = DECODED_ASSETS[pathname]
		
		// FIX: Only fallback to index.html if this is NOT a backend /api request!
		if(!asset && !cleanPath.startsWith("/fusion/rpc") && DECODED_ASSETS["/index.html"]) {
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
				const body = compressedBytes.buffer as ArrayBuffer
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
		
		// If it's an unhandled API endpoint, return an explicit JSON error instead of text
		if(cleanPath.startsWith("/fusion/rpc")) {
			return new Response(JSON.stringify({error: `Unhandled API endpoint: ${cleanPath}`}), {
				status: 404,
				headers: {"Content-Type": "application/json"},
			})
		}
		
		return new Response("Not Found", {status: 404})
	},
}

export default serverEngine
