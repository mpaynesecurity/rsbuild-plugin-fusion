import { defineConfig } from "taze"

export default defineConfig({
	retry: 4,
	// write to package.json
	write: true,
	// run `npm install` or `yarn install` right after bumping
	install: true,
	// ignore paths for looking for package.json in monorepo
	ignorePaths: [
		"**/node_modules/**",
		"**/test/**",
	],
	depFields: {
		overrides: false,
	},
})

