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
				const args = await req.json()
				const result = serverFns.get( id )( ...args )
				return Response.json( { result } )
			}
			catch {
				return Response.json( { error: "Internal Server Error" }, { status: 500 } )
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