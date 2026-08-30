import { createMemo, createResource, createSignal, Show } from "solid-js"
import { useServerAction$ } from "@mpaynesecurity/rsbuild-plugin-fusion"

const getHomeDirectory = useServerAction$(async () => {
	return (await (import("node:os"))).homedir()
})

const getBunVersion = useServerAction$(async () => {
	return process.versions.bun
})

const getTestFile = useServerAction$(async (fileName: string) => {
	const os = await import("node:os")
	const fs = await import("node:fs")
	return fs.readFileSync(`${os.homedir()}/${fileName}`, "utf-8")
})

export default () => {
	const [homeDir] = createResource(getHomeDirectory)
	const [bunVersion] = createResource(getBunVersion)
	
	const [currentFile] = createSignal("test.txt")
	const [testFileContents] = createResource(() => getTestFile(currentFile()))
	
	return (
		<div class="bg-gray-800 flex flex-col gap-5">
			
			<Show fallback={<p>Loading OS data...</p>} when={homeDir}>
				<pre class="text-gray-100">Home Directory: {homeDir()}</pre>
			</Show>
			<Show fallback={<p>Loading Bun Version..</p>} when={getBunVersion}>
				<pre class="text-gray-100">Bun Version: {bunVersion()}</pre>
			</Show>
			<Show fallback={<p>Loading File..</p>} when={getTestFile}>
				<pre class="text-gray-100">File Contents: {testFileContents()}</pre>
			</Show>
		</div>
	)
}