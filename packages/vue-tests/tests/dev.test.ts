import { createRsbuild } from "@rsbuild/core"
import { test, expect, describe } from "@rstest/playwright"

import config from "../rsbuild.config.ts"

describe("Vue Plugin", async () => {
	test("Should execute server action successfully in the Sandbox", async ({page}) => {
		// 1. Boot the real, live compiler completely outside of Playwright's scope
		const rsbuild = await createRsbuild({
			rsbuildConfig: config,
		})
		
		const {server} = await rsbuild.startDevServer()
		
		// 2. Playwright ONLY touches the live, fully compiled network port
		// It never reads or evaluates your source code files directly!
		await page.goto(`http://localhost:${server.port}`)
		
		await expect(page.locator("#version")).toHaveText(process.versions.bun)
		await page.screenshot({
			path: "./dev.png",
		})
		await server.close()
	})
})