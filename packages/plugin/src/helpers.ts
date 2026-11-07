import { createHash } from "node:crypto"

export const generateHash = (hashContent: string): string => {
	return createHash("sha256").update(hashContent).digest("hex").slice(0, 8)
}
