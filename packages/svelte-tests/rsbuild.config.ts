import { fusionPlugin } from "@mpaynesecurity/rsbuild-plugin-fusion"
import { defineConfig } from "@rsbuild/core"
import { pluginSvelte } from "@rsbuild/plugin-svelte"

// Docs: https://rsbuild.rs/config/
export default defineConfig({
	plugins: [
		fusionPlugin(),
		pluginSvelte(),
	],
	server: {
		port: 5008,
	},
	html: {
		title: "Svelte Sandbox",
	},
})
