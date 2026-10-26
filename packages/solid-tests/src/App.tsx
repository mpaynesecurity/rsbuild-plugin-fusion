import { createResource, Show } from "solid-js"

import { getHomeDir } from "./fn01.server"
import { getBunVersion } from "./fn02.server.ts"

export const App = () => {
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