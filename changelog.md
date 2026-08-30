## Changelog

### 🚀 Enhancements

- ⚠️ Significant code restructuring and optimization.

- chore: Moved rpcMacroLoader to "templates" folder.

- chore: Stopped using changesets, did not see huge benefit being a solo dev.

- test: Tried to remove string template in index.ts to a template file, but string replacement was not working properly.
  Further rework required.

- docs: Added detailed jsdoc string to key points in the code base
  ([06dc78f](https://github.com/payneusmc07/rsbuild-plugin-fusion/commit/06dc78f))

### 📖 Documentation

- **changeset:** Feat: Fully ported code from payneusmc07/vite-plugin-fusion. Fixed major parsing bug, passing
  parameters now works. ([28fafc0](https://github.com/payneusmc07/rsbuild-plugin-fusion/commit/28fafc0))

### ✅ Tests

- Tried to use Solid v2 and associated Rsbuild plugin, but the v2 api is geared heavily towards ssr and is very
  different from v1. Further testing needed before versions are bumped.
  ([73f1001](https://github.com/payneusmc07/rsbuild-plugin-fusion/commit/73f1001))

#### ⚠️ Breaking Changes

- N/A

### ❤️ Contributors

- Payneusmc07 ([@payneusmc07](https://github.com/payneusmc07))


