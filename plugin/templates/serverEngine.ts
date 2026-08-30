type GZipContent = {
	/**
	 * Is the content gzipped?
	 */
	isGzip: boolean
	/**
	 * Gzipped content
	 */
	content?: string
	/**
	 * Content's size (in bytes)
	 */
	bytes?: number[]
}

/**
 * @see GZipContent
 */
let clientAssets: Record<string, GZipContent> = {}

/**
 * @type {Map<string, (...args: any[]) => any>}
 */
const rpcFunctions = new Map<string, (...args: any[]) => any>()

/*!__RPC_FUNCTIONS_INJECTION_TOKEN__*/

/*!__CLIENT_ASSETS_INJECTION_TOKEN__*/

// The client-side assets (css, js, html)
const ASSETS = JSON.parse(JSON.stringify(clientAssets))

/** @typedef {{"html" | "css" | "js" | "json" }} MimeTypes */
type MimeTypes = "html" | "css" | "js" | "json"

/** @typedef {{ "text/html" | "text/css" | "text/javascript" | "application/json" }} */
type ContentTypes = "text/html" | "text/css" | "text/javascript" | "application/json"

/** @typedef {{html: string, css: string, js: string, json: string}} */
const MIME: Record<MimeTypes, ContentTypes> & {[key: string]: string | undefined} = {
	"html": "text/html",
	"css": "text/css",
	"js": "text/javascript",
	"json": "application/json",
}


/**
 * If we  were in Node.js, we could do this in a single line using `zlib.gunzipSync()`.
 * But in the browser, to prevent massive files from freezing the main thread, the native DecompressionStream API
 * forces us to use asynchronous streams.
 *
 * Because the `DecompressionStream API` is built for continuous streaming data (like downloading a video chunk by chunk),
 * using it to instantly unzip a single, finite array of bytes requires us to build a structural pipeline, feed it, tear it down,
 * and convert it back.
 *
 * #### Part 1: Converting to the Underlying Memory Block
 * ```ts
 * const rawBuffer = uint8Array.buffer as ArrayBuffer
 * ```
 *
 * A Uint8Array is just a viewing window (a typed view) over a raw chunk of computer memory.
 * The stream API cannot read the "view" directly; it needs access to the raw, underlying binary matrix, which is the ArrayBuffer.
 *
 * #### Part 2: Wrapping the Bytes in a Stream
 * ```ts
 * const stream = new ReadableStream({
 * 		start(controller) {
 * 			controller.enqueue(rawBuffer)
 * 			controller.close()
 * 		},
 * 	}).pipeThrough(new DecompressionStream("gzip"))
 * ```
 * `DecompressionStream` is like a factory conveyor belt, it only processes data that flows through a ReadableStream.
 * Because we aren't actually streaming data from a server (all the bytes are sitting in memory),
 * we have to create a fake, manual stream to hold memory block into it immediately (enqueue) and shut it down instantly (close).
 * We then push the fake stream through the factory worker `pipeThrough(new DecompressionStream("gzip"))` to unpack the data.
 *
 * #### Part 3.1: Using the Response Object as a Collector
 * ```ts
 * const response = new Response(stream)
 * ```
 * Once data flows out of the decompression stream, it is still a fragmented stream of byte chunks.
 * We need a way to collect all those loose chunks and assemble them back into one solid block of memory.
 *
 *
 * #### Part 3.2: Using the Response Object as a Collector
 * ```ts
 * const buffer = await response.arrayBuffer()
 * ```
 * Since the browser's native Response object (the same thing used for fetch requests) is incredibly efficient at collecting streams,
 * we pass the stream into new Response() and call response.arrayBuffer(), which forces the browser to internally wait for the
 * stream to finish, stitch all the pieces together, and hands a single, unified block of memory.
 *
 * #### Part 4: Reconstructing the view
 * ```ts
 * return new Uint8Array(buffer)
 * ```
 * Since we can't directly read the raw decompressed memory block (ArrayBuffer), we must wrap a standard Uint8Array view back over it
 * so JavaScript  can read the actual byte values again.
 *
 * @param {Uint8Array} uint8Array
 * @returns {Promise<Uint8Array>}
 */
const gunzipWeb = async (uint8Array: Uint8Array): Promise<Uint8Array> => {
	/** @typedef {{ArrayBuffer}} rawBuffer */
	const rawBuffer = uint8Array.buffer as ArrayBuffer
	
	/** @typedef {{ReadableStream<Uint8Array<ArrayBuffer>>}} stream */
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(rawBuffer)
			controller.close()
		},
	}).pipeThrough(new DecompressionStream("gzip"))
	
	/** @typedef {{Response}} response */
	const response = new Response(stream)
	
	/** @typedef {{ArrayBuffer}} buffer */
	const buffer = await response.arrayBuffer()
	return new Uint8Array(buffer)
}

/** @typedef {{Record<string, {isGzip: boolean, bytes: Uint8Array}>}} DECODED_ASSETS */
const DECODED_ASSETS = Object.entries(ASSETS).reduce((acc, [key, asset]: [string, any]) => {
	acc[key] = {
		isGzip: !!asset.isGzip,
		bytes: asset.isGzip && asset.content
		       ? Uint8Array.fromBase64(asset.content)
		       : new Uint8Array(asset.bytes || []),
	}
	return acc
}, {} as Record<string, {isGzip: boolean; bytes: Uint8Array}>)

// --- Production server ---
const serverEngine = {
	async fetch(req: Request) {
		const url = new URL(req.url)
		let pathname = url.pathname === "/" ? "/index.html" : url.pathname
		
		// Normalized pathname to prevent double-slash bypass traps (e.g. "//api/rpc")
		const cleanPath = pathname.replace(/\/+/g, "/")
		
		// --- RPC Gateway ---
		if(cleanPath.startsWith("/fusion/rpc")) {
			const id = url.searchParams.get("id")
			
			if(!id || !rpcFunctions.has(id)) {
				return new Response(JSON.stringify({error: `RPC Route Not Found: ${id || "missing id"}`}), {
					status: 404,
					headers: {"Content-Type": "application/json"},
				})
			}
			try {
				// Extract the forData object from the incoming request
				const formData = await req.formData()
				const args = []
				
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
					const val = formData.get(`arg_${i}`)
					
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
		
		// Asset router
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
			
			// Return the client assets if they are gzipped
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
