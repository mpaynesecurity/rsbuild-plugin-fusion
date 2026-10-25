import { Router } from "@solidjs/router"
import { render } from "solid-js/web"
//@ts-ignore
import "./styles.css"
import { NavbarLayout } from "./layouts"
import { navRoutes } from "./types"

const root = document.getElementById("root")

if(root) {
	render(() => <Router root={NavbarLayout}>{navRoutes}</Router>, root)
}