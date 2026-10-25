<script setup lang="ts">
import { ref, onMounted } from "vue"
import { getBunVersion } from "./fn01"

const bunVersion = ref<string>("Loading...")

onMounted(async () => {
	// Await the macro fetch network promise cleanly
	const result = await getBunVersion()
	bunVersion.value = result
})
</script>

<template>
	<div class="content">
		<h1>Rsbuild with Vue</h1>
		<p>Start building amazing things with Rsbuild.</p>
		<p id="version">{{ bunVersion }}</p>
	</div>
</template>

<style scoped>
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
