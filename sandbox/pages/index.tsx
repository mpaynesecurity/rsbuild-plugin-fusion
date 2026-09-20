import { useServerAction$ } from "@mpaynesecurity/rsbuild-plugin-fusion"
import { createResource, createSignal, Show } from "solid-js"

const getHomeDirectory = useServerAction$(async () => {
	return (await (import("node:os"))).homedir()
})

const getBunVersion = useServerAction$(async () => {
	return process.versions.bun
})

const getTestFile = useServerAction$(async (fileName: string) => {
	const {readFileSync} = await import("node:fs")
	const {homedir} = await import("node:os")
	
	return readFileSync(`${homedir()}/${fileName}`, "utf-8")
})

const writeTestFile = useServerAction$(async (fileName: string) => {
	const {existsSync, readFileSync, writeFileSync} = await import("node:fs")
	const {homedir} = await import("node:os")
	
	const fName = `${homedir()}/${fileName}`
	
	if(!existsSync(fName)) {
		writeFileSync(fName, "Written by fusion!")
	}
	console.log("Check your home directory for the new file")
})

export default () => {
	const [homeDir] = createResource(getHomeDirectory)
	
	const [bunVersion] = createResource(getBunVersion)
	
	const [currentFile] = createSignal("test.txt")
	
	const [testFileContents] = createResource(() => getTestFile(currentFile()))
	
	return (
		<div class="flex justify-center">
			<div class="bg-black/40 flex flex-col gap-5 p-5 rounded-md">
				<Show fallback={<p>Loading OS data...</p>} when={homeDir}>
					<pre class="text-gray-100">Home Directory: {homeDir()}</pre>
				</Show>
				<Show fallback={<p>Loading Bun Version..</p>} when={bunVersion}>
					<pre class="text-gray-100">Bun Version: {bunVersion()}</pre>
				</Show>
				<Show fallback={<p class="text-gray-100">Loading File..</p>} when={testFileContents}>
					<pre class="text-gray-100">Test File: {homeDir()}/{currentFile()}</pre>
					<pre class="text-gray-100">File Contents: {testFileContents()}</pre>
					<button type="button" class="bg-indigo-600 px-3 py-2 text-gray-200 rounded-md" onClick={() => writeTestFile("test3.txt")}>Write File</button>
				</Show>
			</div>
		</div>
	
	)
}