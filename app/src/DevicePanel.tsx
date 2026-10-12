import { Button, InlineLink, Text, WalletIcon } from "@pollinations/ui";
import { showEditor } from "./jweb.mjs";

export function DevicePanel() {
	return (
		<section
			className="mj-device-controls mj-app"
			data-theme="live"
			aria-label="MIDI Journey 2 device controls"
		>
			<div className="mj-device-main">
				<Button
					size="md"
					className="mj-device-open"
					onClick={() => showEditor(window)}
				>
					Open chat
				</Button>
				<Text size="xs" tone="muted" className="mj-device-balance">
					<WalletIcon aria-hidden="true" />
					MIDI Journey 2 uses your Pollinations balance to generate MIDI.
				</Text>
			</div>
			<footer className="mj-device-footer">
				<InlineLink
					href="https://pollinations.ai/"
					target="_blank"
					rel="noopener noreferrer"
					tone="quiet"
					size="footer"
				>
					pollinations.ai
				</InlineLink>
			</footer>
		</section>
	);
}
