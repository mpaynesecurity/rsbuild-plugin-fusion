import { defineConfig } from "@rslib/core"
import * as pkg from "./package.json" with { type: "json" }

export default defineConfig({
	lib: [
		{
			format: "esm",
			syntax: "esnext",
			id: "fusion",
			dts: {
				isolated: true,
			},
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
			"rpcMacroLoader": "rpcMacroLoader.ts",
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
