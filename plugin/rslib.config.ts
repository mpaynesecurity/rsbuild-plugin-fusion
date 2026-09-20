import { defineConfig } from "@rslib/core"
import * as pkg from "./package.json" with { type: "json" }

export default defineConfig({
	lib: [
		{
			dts: {
				//isolated: true,
				autoExtension: true,
			},
			splitChunks: {
				preset: "default",
			},
			format: "esm",
			id: "fusion",
			syntax: "esnext",
		},
	],
	output: {
		autoExternal: true,
		cleanDistPath: true,
		// Do not bundle dev dependencies
		externals: [...Object.keys(pkg.devDependencies)],
		// Stops *.LICENSE.txt sidecars
		legalComments: "inline",
		module: true,
		sourceMap: false,
		target: "node",
		minify: {
			jsOptions: {
				minimizerOptions: {
					module: true,
					mangle: false,
					minify: true,
					compress: {
						// Required to keep placeholders for dynamically injected routes/assets
						defaults: false,
					},
					// Required to keep placeholders for dynamically injected routes/assets
					format: {
						//comments: "some",
						preserve_annotations: true,
					},
				},
			},
		},
	},
	source: {
		entry: {
			"index": "index.ts",
			"loaders/rpcMacroLoader": "loaders/rpcMacroLoader.ts",
			"types/index": "types/index.ts",
			"helpers/index": "helpers/index.ts",
			"templates/serverEngine": "templates/serverEngine.ts",
		},
	},
	tools: {
		rspack: {
			stats: {
				errors: true,
				errorDetails: true,
				errorStack: false,
				env: true,
				runtime: true,
			},
			output: {
				asyncChunks: true,
				module: true,
			},
		},
		swc: {
			collectTypeScriptInfo: {
				exportedEnum: true,
				typeExports: true,
			},
		},
	},
})
