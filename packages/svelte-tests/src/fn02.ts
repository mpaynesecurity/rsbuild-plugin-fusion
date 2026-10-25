"use fusion"

import { readFile } from "node:fs/promises"
import { homedir } from "node:os"

export const readFileFromHomeDir = async (file: string) => {
	return await readFile(`${homedir()}/${file}`, "utf-8")
}
