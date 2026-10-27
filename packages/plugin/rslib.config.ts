import { RsdoctorRspackPlugin } from "@rsdoctor/rspack-plugin"
import { defineConfig, type RslibConfig } from "@rslib/core"

const config: RslibConfig = defineConfig({
	lib: [
		{
			//bundle: false,
			dts: {
				isolated: true,
				autoExtension: true,
			},
			splitChunks: {
				preset: "default",
			},
			format: "esm",
			id: "fusion",
			syntax: "esnext",
			output: {
				autoExternal: {
					devDependencies: true,
				},
				cleanDistPath: true,
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
								preserve_annotations: true,
							},
						},
					},
				},
			},
			source: {
				entry: {
					index: "index.ts",
					"helpers/index": "helpers/index.ts",
					"types/index": "types/index.ts",
					"templates/serverEngine": "templates/serverEngine.ts",
					"loaders/fusionLoader": "loaders/fusionLoader.ts",
					
				},
			},
		},
	],
	tools: {
		rspack: {
			plugins: [
				process.env.RSDOCTOR ? new RsdoctorRspackPlugin({
					port: 8080,
				}) : null,
			],
			incremental: true,
			lazyCompilation: true,
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
export default config