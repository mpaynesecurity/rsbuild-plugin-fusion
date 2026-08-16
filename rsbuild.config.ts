import { defineConfig } from "@rsbuild/core"
import { pluginBabel } from "@rsbuild/plugin-babel"
import { pluginSolid } from "@rsbuild/plugin-solid"
import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss"
import { fusionPlugin } from "@mpaynesecurity/fusion"

export default defineConfig({
	output: {
		minify: false,
	},
	plugins: [
		fusionPlugin(),
		pluginBabel({
			include: /\.(?:jsx|tsx)$/,
		}),
		pluginSolid(),
		pluginTailwindcss(),
	],
	dev: {
		browserLogs: {
			stackTrace: "none",
		},
		lazyCompilation: true,
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
			},
		},
	},
	source: {
		entry: {
			index: "./sandbox/index.tsx",
		},
	},
	server: {
		port: 5000,
		publicDir: false,
	},
})
