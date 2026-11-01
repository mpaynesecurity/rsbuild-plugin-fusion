import { describe, expect, it } from "@rstest/core"
import { getRuntime, generateHash, parseFns } from "../src/helpers.ts"


describe("getRuntime", () => {
	it("Detects the current runtime", () => {
		const rt = getRuntime()
		
		const currentEngine = process.versions?.bun ? "bun" : "node"
		
		expect(rt).toBe(currentEngine)
	})
})

describe("generateHash", () => {
	it("Creates a unique id of a specified length", () => {
		expect(generateHash(5).length).toBe(5)
	})
})


describe("Fusion Loader", () => {
	it("Parses code and finds all exports", () => {
		const code = `
		const myNonExportedCode = ""
		export function myFn1(){}
		export const myFn2 = () => {}
		`
		const {exportedFns} = parseFns(code)
		
		expect(exportedFns.length).toBe(2)
	})
})

describe("Macro Generator", () => {

})