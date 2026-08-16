export default () => {
	return (
		<form class="bg-dark p-3 text-gray-100">
			<div class="flex flex-col gap-2 items-center">
				<label for="ctx">
					Get Current Context:
				</label>
				<input id="ctx"
					name="context"
					type="text"
					class="border border-gray-600 focus-visible:border-indigo-600/80 outline-none px-2 py-1 rounded-sm bg-gray-800/70"
				/>
			</div>
			<button class="bg-indigo-600 px-3 py-2 rounded-sm block">Get Context</button>
		</form>
	)
}