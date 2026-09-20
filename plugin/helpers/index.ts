import { FormalParameter, TSType, TSTypeAnnotation } from "oxc-parser"
import { OxcParam } from "../types"

/**
 * Convert Windows style `\\` into `/`
 * @param {string} filePath
 * @returns {string}
 */
export const normalizePath = (filePath: string): string => {
	if(!filePath) {
		return ""
	}
	
	// Force all backslashes into forward slashes for URL compliance
	let cleanPath = filePath.replace(/\\/g, "/")
	
	// Strip any leading relative indicators (./ or /) if they exist
	if(cleanPath.startsWith("./")) {
		cleanPath = cleanPath.slice(2)
	}
	else if(cleanPath.startsWith("/")) {
		cleanPath = cleanPath.slice(1)
	}
	
	return cleanPath
}

/**
 * Generate a unique id (hash) for each rpc function
 * @param {string} value
 * @returns {string}
 */
export const generateHash = (value: string): string => {
	const normalized = normalizePath(value)
	return Bun.hash(normalized).toString().substring(0, 8)
}

/**
 * #### TS Gymnastics Parts 3 and 4: The Annotation Wrapper and  Inner Type Node
 *
 * @summary
 *  ### The annotation wrapper `TsTypeAnnotation`
 *  Acts as a "grammatical anchor" for `:` in the code.
 *  It tells the compiler, "everything following the colon until a comma or closing parenthesis is a type definition.
 *  It doesn't hold the type name itself". It has a single property called `.typeAnnotation` which points to the actual "type".
 *
 *  ### The inner node type `typeAnnotation.typeAnnotation`
 *  Holds the actual information type information, and why we had to use startsWith and
 *  endsWith in the utility function. OXC classifies types into strict structural buckets, `Primitive Keywords` and
 *  `Type References`
 *
 *  #### Primitive Keywords (TSStringKeyword, TSNumberKeyword)
 *  The parser encounters a built-in language primitive. It explicitly names the node after the primitive to save processing time.
 *
 *  #### Type References (TSTypeReference)
 *  The parser encounters a word it doesn't natively own (like a custom class or interface User). It flags it as
 *  a "reference" and sticks the name inside a nested .typeName.name object.
 *
 * @param {OxcParam} param
 * @returns {TSTypeAnnotation | TSType | null | undefined }
 */
export const getParamType = (param: OxcParam): TSTypeAnnotation | TSType | null | undefined => {
	if(param.type === "TSParameterProperty") {
		const inner: FormalParameter = param.parameter
		return "typeAnnotation" in inner ? inner.typeAnnotation : null
	}
	return "typeAnnotation" in param ? param.typeAnnotation : null
}