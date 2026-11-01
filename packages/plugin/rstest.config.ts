import { withRsbuildConfig } from "@rstest/adapter-rsbuild"
import { defineConfig } from "@rstest/core"

// Docs: https://rstest.rs/config/
export default defineConfig({
	extends: withRsbuildConfig(),
	globals: true,
	//setupFiles: ["./tests/rstest.setup.ts"],
})
