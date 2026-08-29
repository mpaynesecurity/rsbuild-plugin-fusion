import { fusionPlugin } from "@mpaynesecurity/rsbuild-plugin-fusion"
import { defineConfig } from "@rsbuild/core"
import { pluginBabel } from "@rsbuild/plugin-babel"
import { pluginSolid } from "@rsbuild/plugin-solid"
import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss"

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
		preset: "default",
	},
	performance: {
		removeConsole: true,
	},
	plugins: [
		fusionPlugin(),
		pluginBabel({
			include: /\.(?:jsx|tsx)$/,
			parallel: true,
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
