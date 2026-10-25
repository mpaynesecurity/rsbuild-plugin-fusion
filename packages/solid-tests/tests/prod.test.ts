import { expect, test, describe } from "@rstest/playwright"
import type { Subprocess } from "bun"
import { rm } from "node:fs/promises"

// Keep track of the process at the file level
let bunProcess: Subprocess<any, any>

// Define a concrete port so your server and test agree
const TEST_PORT = 5010

test.beforeAll(async () => {
	// Spin up your server process and inject the port environment variable
	bunProcess = Bun.spawn(["bun", "dist/index.js"], {
		env: {
			...process.env,
			PORT: TEST_PORT.toString(),
		},
	})
	
	// Give your server a brief moment (e.g., 50ms) to spin up and bind to the port
	await new Promise(resolve => setTimeout(resolve, 50))
})

// Correctly register after All at the top-level scope
test.afterAll(async () => {
	if(bunProcess) {
		bunProcess.kill() // Kills the process cleanly
		await bunProcess.exited // Ensures the process fully shuts down
	}
})

describe("Built Solid sandbox", () => {
	test("Should serve the built app", async ({page}) => {
		// Reference the matching local port
		await page.goto(`http://localhost:${TEST_PORT}`)
		await expect(page.locator("#version")).toHaveText(process.versions.bun)
		await page.screenshot({
			path: "./prod.png",
		})
	})
})


