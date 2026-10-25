<script lang="ts">
	import { getBunVersion } from "./fn01.ts"
	import { readFileFromHomeDir } from "./fn02.ts"

	type Props = {
		tool: string
		framework: string
	};

	let {tool, framework}: Props = $props()
</script>

<template>
	<div class="content">
		{#await getBunVersion()}
			<p>Loading...</p>
		{:then result}
			<h1>{tool} with {framework}</h1>
			<p>Start building amazing things with Rsbuild.</p>
			<p id="version">{result}</p>
		{/await}
		<div>
			{#await readFileFromHomeDir("test3.txt")}
				<p>Loading...</p>
			{:then fileContent}
				<p id="fileContent">{ fileContent }</p>
			{/await}
		</div>
	</div>
</template>

<style>
    .content {
        display: flex;
        min-height: 100vh;
        line-height: 1.1;
        text-align: center;
        flex-direction: column;
        justify-content: center;
    }

    .content h1 {
        font-size: 3.6rem;
        font-weight: 700;
    }

    .content p {
        font-size: 1.2rem;
        font-weight: 400;
        opacity: 0.5;
    }
</style>
