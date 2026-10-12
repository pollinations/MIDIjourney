import { PolliProvider } from "@pollinations/sdk/react";
import {
	Alert,
	ColorModeToggle,
	Heading,
	Surface,
	Text,
} from "@pollinations/ui";
import faviconUrl from "@pollinations/ui/brand/mark.svg";
import { createRoot } from "react-dom/client";
import { AppEntry } from "./BrowserConnect";
import "./style.css";

const root = document.getElementById("root");
if (!root) throw new Error("MIDI Journey 2 root is missing.");
const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.href = faviconUrl;
document.head.append(favicon);

createRoot(root).render(
	__MIDIJOURNEY_APP_KEY__ ? (
		<PolliProvider
			appKey={__MIDIJOURNEY_APP_KEY__}
			permissions={["profile", "usage"]}
		>
			<AppEntry />
		</PolliProvider>
	) : (
		<main className="mx-auto max-w-5xl p-6">
			<ColorModeToggle />
			<Surface variant="panel">
				<Heading as="h1">MIDI Journey 2</Heading>
				<Alert intent="warning" title="App configuration required">
					<Text>
						Use the existing local MIDI Journey 2 app-key configuration before
						starting the browser UI. No key has been created or changed.
					</Text>
				</Alert>
			</Surface>
		</main>
	),
);
