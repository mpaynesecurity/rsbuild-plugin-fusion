import { createResource, Show } from "solid-js"
import { useServerAction$ } from "@mpaynesecurity/fusion"

const osData = useServerAction$(async () => {
	return (await (import("node:os"))).homedir()
})

export default () => {
	const [serverData] = createResource(osData)
	return (
		<div class="bg-gray-800 flex flex-col gap-5">
			
			{/* Works flawlessly without Suspense hooks because we aren't rendering on Node */}
			<Show fallback={<p>Loading OS data...</p>} when={serverData}>
				<pre class="text-gray-100">{serverData()}</pre>
			</Show>
		</div>
	)
}