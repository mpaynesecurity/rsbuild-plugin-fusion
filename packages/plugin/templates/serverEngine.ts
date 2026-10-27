let clientAssets: Record<string, {content?: string, isGzip: boolean, bytes?: number[]}> = {}

const rpcFunctions: Map<string, (...args: any[]) => any> = new Map<string, (...args: any[]) => any>()

//@ts-ignore - Required for dynamic asset injection
__CLIENT_ASSETS_INJECTION_TOKEN__

//@ts-ignore - Required for rpc function asset injection
__SERVER_FUNCTIONS_INJECTION_TOKEN__

/** Allowed mime types */
type MimeTypes = "html" | "css" | "js" | "json" | "text"

/** Allowed content types */
type ContentTypes = "text/html" | "text/css" | "text/javascript" | "application/json" | "application/text"

/**
 * key:value pair sets for various mime types
 * @type {{html: string, css: string, js: string, json: string}}
 */
const mimes: Record<MimeTypes, ContentTypes> & {[key: string]: string | undefined} = {
	"html": "text/html",
	"css": "text/css",
	"js": "text/javascript",
	"json": "application/json",
	"text": "application/text",
}

export default {
	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url)
		
		let pathname = url.pathname === "/" ? "/index.html" : url.pathname
		
		// Normalized pathname to prevent double-slash bypass traps (e.g. "//api/rpc")
		const cleanPath = pathname.replace(/\/+/g, "/")
		
		// --- RPC Gateway ---
		if(cleanPath.startsWith("/fusion/rpc")) {
			const id = url.searchParams.get("id")
			
			// Return a `404` if the id of the extracted function was not found
			if(!id || !rpcFunctions.has(id)) {
				return new Response(JSON.stringify({error: `RPC Route Not Found: ${id || "missing id"}`}), {
					status: 404,
					headers: {"Content-Type": "application/json"},
				})
			}
			try {
				const args = await req.json()
				const rpcFn = rpcFunctions.get(id)!
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
		
		// SPA Fallback logic: check read-only clientAssets directly
		let asset = clientAssets[pathname]
		
		if(!asset && !cleanPath.startsWith("/fusion/rpc") && clientAssets["/index.html"]) {
			pathname = "/index.html"
			asset = clientAssets["/index.html"]
		}
		
		if(asset) {
			const lastDot = pathname.lastIndexOf(".")
			const ext = lastDot !== -1 ? pathname.substring(lastDot + 1) : ""
			
			// Define content types
			const contentType = mimes[ext] || "application/octet-stream"
			
			// Configure caching options
			const cacheControl = pathname === "/index.html" ? "no-cache" : "public, max-age=31536000, immutable"
			
			// Natively parse the raw data layout out of the global cache block
			const rawBytes = asset.content
			                 ? new Uint8Array(Buffer.from(asset.content, "base64"))
			                 : new Uint8Array(asset.bytes || [])
			
			// Configure caching headers
			const cacheControlHeaders: Record<string, string> = {
				"Content-Type": contentType,
				"Cache-Control": cacheControl,
			}
			
			// If the assets are gzipped, set the encoding headers
			if(asset.isGzip) {
				cacheControlHeaders["Content-Encoding"] = "gzip"
			}
			
			// Pass the Uint8Array view directly to prevent memory leaks/data corruption
			return new Response(rawBytes, {status: 200, headers: cacheControlHeaders})
		}
		
		// Return a "generic" not found error if it dropped out of everything else
		return new Response("Not Found", {status: 404})
	},
}
