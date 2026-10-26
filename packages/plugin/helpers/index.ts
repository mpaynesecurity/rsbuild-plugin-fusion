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
	return Bun.hash(value).toString().substring(0, 8)
}

