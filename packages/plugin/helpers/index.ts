/**
 * Generate a unique id (hash) for each rpc function
 * @param {string} value
 * @returns {string}
 */
export const generateHash = (value: string): string => {
	return Bun.hash(value).toString().substring(0, 8)
}

import { ParseResult, parseSync } from "oxc-parser"

/**
 *
 * @param {string} filePath
 * @param {string} code
 * @returns {{exportedFns: string[], result: ParseResult}}
 */
export const useParser = (filePath: string, code: string): {exportedFns: string[]; result: ParseResult} => {
	const exportedFns: string[] = []
	
	const result = parseSync(filePath, code, {lang: "ts", sourceType: "module"})
	
	// Guard against broken/empty parse structures immediately
	if(!result.program || !result.program.body) {
		return {exportedFns, result}
	}
	
	for(const statement of result.program.body) {
		if(statement.type === "ExportNamedDeclaration" && statement.declaration) {
			const decl = statement.declaration
			
			// Handles: export function myFn() {}
			if(decl.type === "FunctionDeclaration" && decl.id) {
				exportedFns.push(decl.id.name)
			}
			
			// Handles: export const myFn = () => {}
			if(decl.type === "VariableDeclaration") {
				for(const declarator of decl.declarations) {
					if(declarator.id && "type" in declarator.id) {
						const idNode = declarator.id
						if((idNode.type === "Identifier") && idNode.name) {
							exportedFns.push(idNode.name)
						}
					}
				}
			}
		}
	}
	
	return {exportedFns, result}
}
