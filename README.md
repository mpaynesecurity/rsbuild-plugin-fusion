# rsbuild-plugin-fusion

### Run server code directly from any Rsbuild supported UI framework

![NPM License](https://img.shields.io/npm/l/%40mpaynesecurity%2Frsbuild-plugin-fusion)
![npm package minimized gzipped size](https://img.shields.io/bundlejs/size/%40mpaynesecurity%2Frsbuild-plugin-fusion)
![NPM Downloads](https://img.shields.io/npm/dm/%40mpaynesecurity%2Frsbuild-plugin-fusion)
![GitHub Sponsors](https://img.shields.io/github/sponsors/mpaynesecurity)
![GitHub Repo stars](https://img.shields.io/github/stars/payneusmc07/rsbuild-plugin-fusion)

**Important:**`Plugin is optimized for and only works with the Bun runtime.`

**Important:**`Plugin is built on WinterCG-compliant web standards (Request, Response, and standard ES modules).
If your cloud provider or runtime does not support standard web primitives, that is a limitation of the provider, not
this tool.`

## Getting Started

### 1. Install the plugin

```bash
bun install @mpaynesecurity/rsbuild-plugin-fusion
```

### 2. Add it to your Rsbuild config

```tsx
// rsbuild.config.ts
import { defineConfig } from "@rsbuild/core"
import { fusionPlugin } from "@mpaynesecurity/rsbuild-plugin-fusion"

export default defineConfig({
	plugins: [fusionPlugin()]
})
```

### 3. Create a page/component

**SolidJs**

```ts
// fn01.ts
"use fusion"

export const getBunVersion = () => process.versions.bun
```

```ts
// fn02.ts
"use fusion"

import { homedir } from "node:os"

export const getHomeDir = () => homedir()
```

```tsx
import { createResource, Show } from "solid-js"

import { getBunVersion } from "./fn01"
import { getHomeDir } from "./fn02"

export default () => {
	const [bunVersion] = createResource(getBunVersion)
	const [homeDir] = createResource(getHomeDir)
	return (
		<div class="content">
			<div class="bg-black/40 flex flex-col gap-5 p-5 rounded-md">
				<Show fallback={<p>Loading OS data...</p>} when={homeDir}>
					<pre class="text-gray-100" id="homedir">{homeDir()}</pre>
				</Show>
				<Show fallback={<p>Loading Bun Version..</p>} when={bunVersion}>
					<pre class="text-gray-100" id="version">{bunVersion()}</pre>
				</Show>
			</div>
		</div>
	
	)
}
```

### 4. Run the dev server

```bash
bun --bun rsbuild
```

### 5. Build For Production

```bash
bun --bun rsbuild build
```

## Fusion vs. Meta-Frameworks

#### 1. Handling of browser and server code

Meta-frameworks treat the browser build and server build as completely separate targets that require a heavy bridge to talk to each other. Fusion blends both code bases together with minimal runtime dependencies.

#### 2. Elimination of Code-Splitting and Chunks Manifests

Meta-frameworks have to generate dozens of sliced chunks and maintain a massive JSON layout file to map client-side network stubs back to server-side files. Fusion cuts out that entire layer because every image, script, stylesheet, and server action lives inside the same memory space.

#### 3. Single-Pass High Performance Routing

Instead of spinning up heavy application routing instances or framework controllers, Fusion matches assets out of a native JavaScript object and serves them directly out of RAM. Text assets are pre-gzipped during compilation, meaning the server doesn't waste CPU cycles compressing assets on the fly.

#### 4. Safe Server Isolation and Closure Execution

Fusion's utilization of explicit dynamic imports inside its `useServerAction$` macro allows for full access native Node modules such as `node:fs`, `process.*`, but ensures their code is never leaked into the browser bundle. The browser only receives a `fetch()` call, giving absolute isolation without complex compiler layers.

## Disclaimers

- Production testing was achieved on Cloudflare via Wrangler (I am not in a financial position to use multiple cloud providers),
- I work a very demanding day job which requires frequent travel. PRs and bug fixes are welcome, but they may not be addressed right away.

## Thank You

- [Rsbuild/Rspack](https://rsbuild.rs)
- [Bun/Anthropic](https://bun.sh)
