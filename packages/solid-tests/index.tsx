import { render } from "solid-js/web"
//@ts-ignore
import "./styles.css"
import { App } from "./src/App"

const root = document.getElementById("root")

if(root) {
	render(() => <App />, root)
}