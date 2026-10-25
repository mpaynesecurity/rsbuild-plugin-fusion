import { mount } from "svelte"
import App from "./App.svelte"
//@ts-ignore
import "./index.css"

const app = mount(App, {
	target: document.body,
	props: {
		tool: "Rsbuild",
		framework: "Svelte",
	},
})

export default app
