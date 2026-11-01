import { RsdoctorRspackPlugin } from "@rsdoctor/rspack-plugin"
import { defineConfig, type RslibConfig } from "@rslib/core"
import { dirname, resolve } from "node:path"

const config: RslibConfig = defineConfig({
	lib: [
		// bundleless
		{
			id: "fusion-no-bundle",
			bundle: false,
			dts: {
				isolated: true,
				autoExtension: true,
			},
			source: {
				entry: {
					index: ["src/**", "!src/__*.ts", "src/plugins/**"],
				},
			},
			splitChunks: {
				usedExports: true,
				preset: "default",
			},
			tools: {
				rspack: {
					module: {
						rules: [
							{
								test: /\.ts$/,
								use: {
									loader: resolve("src", "loaders", "fusionLoader.ts"),
								},
							},
						],
					},
					plugins: [
						process.env.RSDOCTOR ? new RsdoctorRspackPlugin({
							port: 8080,
							
						}) : null,
					],
				},
			},
		},
	],
	// Global options
	output: {
		cleanDistPath: true,
		autoExternal: {
			devDependencies: true,
		},
		minify: {
			jsOptions: {
				minimizerOptions: {
					mangle: false,
					minify: true,
				},
			},
		},
		module: true,
		target: "node",
	},
	format: "esm",
	syntax: "esnext",
	tools: {
		rspack: {
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
	},
})
export default config