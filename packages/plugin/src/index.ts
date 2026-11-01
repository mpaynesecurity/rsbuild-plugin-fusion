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
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { useServerFnMiddleware } from "./middleware.ts"
import { FusionAssetEmitterPlugin } from "./plugins/asset-emitter.ts"

export const fusionPlugin = (): RsbuildPlugin => ({
	name: "fusion",
	enforce: "pre",
	setup({
		logger,
		modifyRspackConfig,
		onBeforeStartDevServer,
		context,
	}) {
		const filename = fileURLToPath(import.meta.url)
		const localDirectory = dirname(filename)
		
		modifyRspackConfig(({module, plugins}) => {
			module = module || {}
			module.rules = module.rules || []
			
			const fusionLoaderPath = resolve(localDirectory, "loaders", "fusionLoader.js")
			
			if(!fusionLoaderPath) {
				logger.error(`${fusionLoaderPath} was not found`)
				process.exit(1)
			}
			
			module.rules.push({
				test: /\.server\.ts$/,
				exclude: /node_modules/,
				enforce: "pre",
				use: [
					{
						loader: fusionLoaderPath,
					},
				],
			})
			plugins.push(new FusionAssetEmitterPlugin(localDirectory, context))
		})
		
		
		onBeforeStartDevServer(({server}) => {
			useServerFnMiddleware(server.middlewares, "/fusion/rpc")
		})
		/*
		 onCloseBuild(async () => {
		 // Return if the "command" is not "build"
		 if(context.action !== "build") {
		 return
		 }
		 logger.start("Starting build process")
		 
		 // Path to dist/
		 const prodDistPath = context.distPath
		 
		 logger.info(`-> Found ${productionFnManifest.size} functions`)
		 
		 // Placeholder for dynamically injected import statements
		 const msImports = new MagicString("")
		 
		 const serverFnOutputDir = `${prodDistPath}/server-fn`
		 
		 await mkdir(serverFnOutputDir, {recursive: true})
		 
		 // for(const [serverFnId, srcFilePath] of productionFnManifest.entries()) {
		 // 	const serverFn = await readFile(srcFilePath, "utf-8")
		 //
		 // 	const transpiledServerFn = swc.transformSync(serverFn, {
		 // 		filename: serverFn,
		 // 		jsc: {
		 // 			parser: {
		 // 				syntax: "typescript",
		 // 			},
		 // 			target: "esnext",
		 // 		},
		 // 		module: {
		 // 			type: "nodenext",
		 // 		},
		 // 	}).code
		 //
		 // 	const msServerFnId = new MagicString(serverFnId)
		 //
		 // 	// "fn_13307412_myFnName" -> removes everything up to the final underscore index
		 // 	const hashEndIndex = serverFnId.lastIndexOf("_")
		 // 	msServerFnId.remove(0, hashEndIndex + 1)
		 //
		 // 	await writeFile(`${serverFnOutputDir}/${msServerFnId.toString()}.js`, transpiledServerFn)
		 //
		 // 	msImports.append(`\nimport {${msServerFnId}} from "./server-fn/${msServerFnId}"\nserverFns.set("${serverFnId}", ${msServerFnId})\n`)
		 // }
		 
		 
		 //await generateProdFnBundle(productionFnManifest, serverFnOutputDir)
		 
		 const serverEngineTemplate = resolve(localDirectory, "templates", "serverEngine.js")
		 
		 if(!existsSync(serverEngineTemplate)) {
		 logger.error(`${serverEngineTemplate} not found`)
		 process.exit(1)
		 }
		 
		 const serverEngineCode = await readFile(serverEngineTemplate, "utf-8")
		 
		 const msServerCode = new MagicString(serverEngineCode)
		 
		 msServerCode.prepend(msImports.toString())
		 
		 // const serverFnsPlaceholder = "__SERVER_FUNCTIONS_INJECTION_TOKEN__"
		 // // Find the exact index position of `__SERVER_FUNCTIONS_INJECTION_TOKEN__` text markers
		 // const serverFnIdx = serverEngineCode.indexOf(serverFnsPlaceholder)
		 //
		 // if(serverFnIdx !== -1) {
		 //
		 // 	// Overwrite the explicit boundaries from token start to token end
		 // 	msServerCode.overwrite(serverFnIdx, serverFnIdx + serverFnsPlaceholder.length, msImports.toString())
		 // }
		 // else {
		 // 	logger.error("[Plugin] Error: `SERVER_FUNCTIONS` token placeholder missing")
		 // 	process.exit(1)
		 // }
		 
		 const indexFile = resolve(prodDistPath, "index.js")
		 
		 await writeFile(indexFile, msServerCode.toString())
		 
		 logger.success(`Build artifacts written to ${prodDistPath}`)
		 })
		 
		 */
	},
})