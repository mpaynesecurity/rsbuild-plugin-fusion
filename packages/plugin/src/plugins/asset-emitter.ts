import { type Rspack, type RsbuildContext } from "@rsbuild/core"
import MagicString from "magic-string"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { type Compilation, productionFnManifest } from "../types"
import { AssetSerializer } from "./asset-serializer"

export class FusionAssetEmitterPlugin {
	private readonly name = "FusionServerFnEmitterPlugin"
	
	private readonly localDirectory: string
	
	private readonly context: RsbuildContext
	
	constructor(localDirectory: string, context: RsbuildContext) {
		this.localDirectory = localDirectory
		this.context = context
	}
	
	apply(compiler: Rspack.Compiler): void {
		const {RawSource} = compiler.rspack.sources
		
		compiler.hooks.thisCompilation.tap(this.name, (compilation: Compilation) => {
			compilation.hooks.processAssets.tap(
				{
					name: this.name,
					stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
				},
				() => {
					const serverFns = AssetSerializer.generateServerManifestImports(productionFnManifest, this.context)
					
					const serverTemplateFilePath = resolve(this.localDirectory, "templates", "serverEngine.js")
					
					if(!existsSync(serverTemplateFilePath)) {
						throw new Error(`[Plugin] Error: Source blueprint missing at ${serverTemplateFilePath}`)
					}
					
					const serverTemplate = readFileSync(serverTemplateFilePath, "utf-8")
					const msServerTemplate = new MagicString(serverTemplate)
					
					if(typeof serverFns === "string") {
						msServerTemplate.prepend(serverFns)
					}
					
					compilation.emitAsset("index.js", new RawSource(msServerTemplate.toString()))
				},
			)
			
		})
	}
}