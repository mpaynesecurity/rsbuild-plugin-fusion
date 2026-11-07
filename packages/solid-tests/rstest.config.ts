import { withRsbuildConfig } from "@rstest/adapter-rsbuild"
import { defineConfig } from "@rstest/core"
import { definePlaywrightConfig } from "@rstest/playwright/config"

// Docs: https://rstest.rs/config/
export default defineConfig({
	extends: [withRsbuildConfig(), definePlaywrightConfig({})],
	globals: true,
	testTimeout: 60_000,
	hookTimeout: 45_000,
	expect: {
		poll: {timeout: 2000},
	},
})
