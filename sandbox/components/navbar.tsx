import { A } from "@solidjs/router"
import { createSignal, For } from "solid-js"
import { type INavbarProps } from "@/types"

export const Navbar = (props: INavbarProps) => {
	const [isOpen, setIsOpen] = createSignal(false)
	
	return (
		<nav class="bg-navbar shadow-md w-full top-0 mb-5">
			<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div class="flex items-center justify-end h-16">
					
					{/* Desktop Menu */}
					<div class="hidden md:flex space-x-8">
						<For each={props.routes}>
							{(route) => (
								<A href={route.path}
									class="navlink"
									activeClass="bg-indigo-600"
									end={route.exact}
								>{route.label}</A>
							)}
						</For>
					</div>
					
					{/* Mobile Menu Button */}
					<div class="md:hidden flex items-center">
						<button
							onClick={() => setIsOpen(!isOpen())}
							type="button"
							class="text-gray-400 hover:text-gray-600 focus:outline-none"
							aria-label="Toggle navigation menu"
						>
							<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								{isOpen() ? (
									// "X" close icon when open
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								) : (
									 // Hamburger icon when closed
									 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" />
								 )}
							</svg>
						</button>
					</div>
				
				</div>
			</div>
			
			{/* Mobile Menu */}
			<div class={`md:hidden bg-navbar/60 px-4 pt-2 pb-4 space-y-1 shadow-inner ${isOpen() ? "block" : "hidden"}`}>
				<For each={props.routes}>
					{(route) => (
						<A href={route.path}
							class="navlink"
							activeClass="bg-indigo-600"
							end={route.exact}
						>{route.label}</A>
					)}
				</For>
			</div>
		</nav>
	)
}
