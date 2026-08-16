import { Card } from "@/components"

export default () => {
	return (
		<Card bodyContent={
			<div class=" bg-dark p-5 flex flex-col gap-5 w-fit">
				<textarea readOnly={ true } class="input w-87.5 h-50" />
				<button class="bg-indigo-600 px-4 py-2 rounded-sm block text-gray-100 hover:bg-indigo-700 active:bg-indigo-900" type="button">Get Context</button>
			</div>
		} />
	)
}