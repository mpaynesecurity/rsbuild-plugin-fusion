import { createResource, Show } from "solid-js"

import { getHomeDir } from "./fn01"
import { readFileFromHomeDir } from "./fn02.ts"

export const App = () => {
	const [homeDir] = createResource(getHomeDir)
	const [file] = createResource(() => readFileFromHomeDir("test3.txt"))
	return (
		<div class="content">
			<div class="bg-black/40 flex flex-col gap-5 p-5 rounded-md">
				<Show fallback={<p>Loading OS data...</p>} when={homeDir}>
					<pre class="text-gray-100" id="homedir">{homeDir()}</pre>
				</Show>
			</div>
			<div class="bg-black/40 flex flex-col gap-5 p-5 rounded-md">
				<Show fallback={<p>Loading OS data...</p>} when={file}>
					<pre class="text-gray-100" id="file-content">{file()}</pre>
				</Show>
			</div>
		</div>
	
	)
}