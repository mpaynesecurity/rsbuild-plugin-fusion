import { fusionPlugin } from "@mpaynesecurity/rsbuild-plugin-fusion"
import { defineConfig, type RsbuildConfig } from "@rsbuild/core"
import { pluginSolid } from "@rsbuild/plugin-solid"
import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss"
import { pluginBabel } from "@rsbuild/plugin-babel"

export const config: RsbuildConfig = defineConfig({
	root: ".",
	dev: {
		browserLogs: {
			stackTrace: "none",
		},
		lazyCompilation: true,
	},
	output: {
		minify: true,
		polyfill: "off",
		overrideBrowserslist: ["last 2 versions"],
	},
	splitChunks: {
		preset: "per-package", // Splits node_modules into clean, isolated individual scripts
		chunks: "all",
	},
	performance: {
		removeConsole: true,
	},
	plugins: [
		fusionPlugin(),
		pluginBabel({
			include: /\.(?:jsx|tsx)$/,
		}),
		pluginSolid(),
		pluginTailwindcss(),
	],
	server: {
		port: 5007,
		publicDir: false,
	},
	source: {
		entry: {
			index: "./index.tsx",
		},
	},
	tools: {
		lightningcssLoader: {
			minify: true,
		},
		swc: {
			module: {
				type: "nodenext",
				lazy: true,
			},
		},
	},
	html: {
		title: "Solid Sandbox",
	},
})
export default config