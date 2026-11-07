export default {
	async fetch(req) {
		const url = new URL( req.url )
		let pathname = url.pathname === "/" ? "/index.html" : url.pathname

		// --- 1. RPC Gateway ---
		if ( pathname.startsWith( "/fusion/rpc" ) ) {
			const id = url.searchParams.get( "id" )
			if ( !id || !serverFns.has( id ) ) {
				return Response.json( { error: `RPC Route Not Found: ${id}` }, { status: 404 } )
			}
			try {
				// Parse body safely, defaulting to empty array if empty
				let bodyText = await req.text()
				let args = bodyText ? JSON.parse( bodyText ) : []

				let fn = serverFns.get( id )
				console.log( `[Fusion Runtime] Executing ${id}. Function type:`, typeof fn )

				let result = await fn( ...args )
				console.log( `[Fusion Runtime] Success result for ${id}:`, result )

				return Response.json( { result } )
			}
			catch ( err ) {
				// THIS WILL PRINT THE EXACT SYNTAX, IMPORT, OR RESOLUTION ERROR IN YOUR TERMINAL!
				console.error( `❌ [Fusion Runtime Error] Failed executing RPC ${id}:`, err.stack || err.message || err )
				return Response.json( { error: err.message || "Internal Server Error" }, { status: 500 } )
			}
		}

		// --- 2. Native File Serving (No Streams, No Gzip Code, No Injection) ---
		// Bun automatically looks inside production build folder (e.g., './dist')
		// It handles Gzip/Brotli compression, caching headers, and binary chunks
		// natively at the C++ layer.
		const file = Bun.file( `./dist${pathname}` )

		if ( await file.exists() ) {
			return new Response( file )
		}

		// SPA fallback
		return new Response( Bun.file( "./dist/index.html" ) )
	},
}
