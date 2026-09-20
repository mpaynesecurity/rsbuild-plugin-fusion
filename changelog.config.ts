import { type ChangelogConfig } from "changelogen"

export default {
	output: true,
	// Customize titles and behavior for Conventional Commit types
	types: {
		feat: {title: "🚀 Enhancements", semver: "minor"},
		fix: {title: "🩹 Fixes", semver: "patch"},
		perf: {title: "🔥 Performance", semver: "patch"},
		refactor: {title: "💅 Refactors", semver: "patch"},
		docs: {title: "📖 Documentation", semver: "patch"},
		// Set a type to false to entirely hide it from the changelog
		chore: {title: "Chore", semver: "patch"},
	},
	// Templates used when updating package version and git tags
	templates: {
		commitMessage: "chore(release): v{{newVersion}}",
		tagMessage: "v{{newVersion}}",
		tagBody: "v{{newVersion}}",
	},
} satisfies Partial<ChangelogConfig>