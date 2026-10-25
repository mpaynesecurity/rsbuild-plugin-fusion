import { fusionPlugin } from "@mpaynesecurity/rsbuild-plugin-fusion"
import { defineConfig } from "@rsbuild/core"
import { pluginPreact } from "@rsbuild/plugin-preact"

// Docs: https://rsbuild.rs/config/
export default defineConfig({
	plugins: [
		fusionPlugin(),
		pluginPreact(),
	],
	server: {
		port: 5006,
	},
	html: {
		title: "Preact Sandbox",
	},
})
