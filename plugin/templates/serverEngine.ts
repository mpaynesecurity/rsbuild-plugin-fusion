/** @type {{string, {isGzip: boolean, content?: string, bytes?: number[]}}} */
let clientAssets: Record<string, {isGzip: boolean, content?: string, bytes?: number[]}> = {}

/** @type {Map<string, (...args: any[]) => any>} */
const rpcFunctions: Map<string, (...args: any[]) => any> = new Map<string, (...args: any[]) => any>()

/*!__RPC_FUNCTIONS_INJECTION_TOKEN__*/

/*!__CLIENT_ASSETS_INJECTION_TOKEN__*/

/**
 * Deeply clone any client assets
 * @type {Record<string, {isGzip: boolean, content?: string, bytes?: number[]}>}
 */
const clonedAssets: Record<string, {isGzip: boolean; content?: string; bytes?: number[]}> = structuredClone(clientAssets)

/** Allowed mime types */
type MimeTypes = "html" | "css" | "js" | "json"

/** Allowed content types */
type ContentTypes = "text/html" | "text/css" | "text/javascript" | "application/json"

/**
 * key:value pair sets for various mime types
 * @type {{html: string, css: string, js: string, json: string}}
 */
const mimes: Record<MimeTypes, ContentTypes> & {[key: string]: string | undefined} = {
	"html": "text/html",
	"css": "text/css",
	"js": "text/javascript",
	"json": "application/json",
}

// --- Production server ---
export default {
	async fetch(req: Request) {
		const url = new URL(req.url)
		
		let pathname = url.pathname === "/" ? "/index.html" : url.pathname
		
		// Normalized pathname to prevent double-slash bypass traps (e.g. "//api/rpc")
		const cleanPath = pathname.replace(/\/+/g, "/")
		
		// --- RPC Gateway ---
		if(cleanPath.startsWith("/fusion/rpc")) {
			const id = url.searchParams.get("id")
			
			// Return a `404` error if the id of the extracted function is not in the map
			if(!id || !rpcFunctions.has(id)) {
				return new Response(JSON.stringify({error: `RPC Route Not Found: ${id || "missing id"}`}), {
					status: 404,
					headers: {"Content-Type": "application/json"},
				})
			}
			try {
				const formData: FormData = await req.formData()
				const args: any[] = []
				
				// Create a sequential loop up to a max threshold of args
				for(let i = 0; i < 32; i++) {
					if(!formData.has(`arg_${i}`)) {
						// If it's missing but there are more args ahead (a gap), push undefined to preserve argument position
						if(formData.has(`arg_${i + 1}`)) {
							args.push(undefined)
							continue
						}
						break
					}
					
					/**
					 * Returns a type of `FormDataEntryValue | null`.
					 * This means the retrieved value can only be one of three things: `string`, `File` object, or `null` (if the key doesn't exist)
					 * @type {FormDataEntryValue | null}
					 * */
					const formDataEntryValue: FormDataEntryValue | null = formData.get(`arg_${i}`)
					
					if(formDataEntryValue instanceof File) {
						args.push(formDataEntryValue)
					}
					else if(typeof formDataEntryValue === "string") {
						try {
							args.push(JSON.parse(formDataEntryValue))
						}
						catch {
							args.push(formDataEntryValue)
						}
					}
				}
				
				const rpcFn = rpcFunctions.get(id)!
				
				return new Response(JSON.stringify({result: await rpcFn(...args)}), {
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
		
		// Only fallback to index.html if this is NOT a backend /fusion/rpc request!
		if(!clonedAssets[pathname] && !cleanPath.startsWith("/fusion/rpc") && clonedAssets["/index.html"]) {
			pathname = "/index.html"
			clonedAssets[pathname] = clonedAssets["/index.html"]
		}
		
		if(clonedAssets[pathname]) {
			const lastDot = pathname.lastIndexOf(".")
			
			const ext = lastDot !== -1 ? pathname.substring(lastDot + 1) : ""
			
			// Define content types
			const contentType = mimes[ext] || "application/octet-stream"
			
			// Configure caching options
			const cacheControl = pathname === "/index.html" ? "no-cache" : "public, max-age=31536000, immutable"
			
			// Natively parse the raw data layout
			const rawBytes = clonedAssets[pathname].content
			                 ? Uint8Array.fromBase64(clonedAssets[pathname].content || "")
			                 : new Uint8Array(clonedAssets[pathname].bytes || [])
			
			// Configure caching headers
			const cacheControlHeaders: Record<string, string> = {
				"Content-Type": contentType,
				"Cache-Control": cacheControl,
			}
			
			// If the assets are gzipped, set the caching headers
			if(clonedAssets[pathname].isGzip) {
				cacheControlHeaders["Content-Encoding"] = "gzip"
			}
			// Pass the Uint8Array view directly to prevent memory leaks/data corruption
			return new Response(rawBytes, {status: 200, headers: cacheControlHeaders})
			
		}
		
		// If it's an unhandled API endpoint, return an explicit JSON error instead of text
		if(cleanPath.startsWith("/fusion/rpc")) {
			return new Response(JSON.stringify({error: `Unhandled API endpoint: ${cleanPath}`}), {
				status: 404,
				headers: {"Content-Type": "application/json"},
			})
		}
		// Return a "generic" not found error
		return new Response("Not Found", {status: 404})
	},
}
