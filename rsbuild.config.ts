import { fusionPlugin } from "@mpaynesecurity/rsbuild-plugin-fusion"
import { defineConfig } from "@rsbuild/core"
import { pluginSolid } from "@rsbuild/plugin-solid"
import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss"
import { pluginBabel } from "@rsbuild/plugin-babel"

export default defineConfig({
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
		port: 5000,
		publicDir: false,
	},
	source: {
		entry: {
			index: "./sandbox/index.tsx",
		},
	},
	tools: {
		htmlPlugin: {
			title: "Plugin Sandbox",
		},
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
})
