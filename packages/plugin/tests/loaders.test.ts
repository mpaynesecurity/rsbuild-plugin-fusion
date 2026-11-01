import { describe, expect, it } from "@rstest/core"
import { parseFns } from "../src/helpers.ts"

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