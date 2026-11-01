import { createResource, Show } from "solid-js"

import { getHomeDir } from "./fn01.server"


export const App = () => {
	const [homeDir] = createResource(getHomeDir)
	return (
		<div class="content">
			<div class="bg-black/40 flex flex-col gap-5 p-5 rounded-md">
				<Show fallback={<p>Loading OS data...</p>} when={homeDir}>
					<pre class="text-gray-100" id="homedir">{homeDir()}</pre>
				</Show>
			</div>
		</div>
	
	)
}