import { fusionPlugin } from "@mpaynesecurity/rsbuild-plugin-fusion"
import { defineConfig } from "@rsbuild/core"
import { pluginVue } from "@rsbuild/plugin-vue"

// Docs: https://rsbuild.rs/config/
export default defineConfig({
	plugins: [
		fusionPlugin(),
		pluginVue(),
	],
	server: {
		port: 5009,
	},
	html: {
		title: "Vue Sandbox",
	},
})
