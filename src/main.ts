import {
	App,
	Editor,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	Setting,
	Notice,
} from "obsidian";
import { PromptModal } from "src/prompt-modal";
import { EditorExtensions } from "../editor-extensions";
import { YoutubeTranscript, TranscriptConfig, TranscriptResponse, YoutubeTranscriptError } from "src/fetch-transcript";

interface YTranscriptSettings {
	timestampMod: number;
	lang: string;
	country: string;
}

const DEFAULT_SETTINGS: YTranscriptSettings = {
	timestampMod: 5,
	lang: "en",
	country: "EN",
};

export default class YTranscriptPlugin extends Plugin {
	settings: YTranscriptSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "transcript-from-text",
			name: "Insert YouTube transcript from selected URL",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const url = EditorExtensions.getSelectedText(editor).trim();
				if (url) {
					this.insertTranscript(url, editor, view);
				} else {
					new Notice("No URL selected");
				}
			},
		});

		this.addCommand({
			id: "transcript-from-prompt",
			name: "Insert YouTube transcript from URL prompt",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const prompt = new PromptModal();
				const url: string = await new Promise((resolve) =>
					prompt.openAndGetValue(resolve, () => {})
				);
				if (url) {
					this.insertTranscript(url, editor, view);
				}
			},
		});

		this.addCommand({
			id: "transcript-from-property",
			name: "Insert YouTube transcript from media_link property",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const content = editor.getValue();
				const mediaLinkMatch = content.match(/media_link:\s*(.+?)(?:\r?\n|$)/);

				if (!mediaLinkMatch || !mediaLinkMatch[1]) {
					new Notice("No media_link property found in the note");
					return;
				}

				const url = mediaLinkMatch[1].trim();
				if (url) {
					this.insertTranscript(url, editor, view);
				} else {
					new Notice("Media link is empty");
				}
			}
		});

		this.addSettingTab(new YTranscriptSettingTab(this.app, this));
	}

	async insertTranscript(url: string, editor: Editor, view: MarkdownView) {
		try {
			new Notice("Fetching YouTube transcript...");

			// Use the YoutubeTranscript class from your fetch-transcript.ts file
			const config: TranscriptConfig = {
				lang: this.settings.lang,
				country: this.settings.country
			};

			const transcript = await YoutubeTranscript.fetchTranscript(url, config);

			if (!transcript || transcript.lines.length === 0) {
				new Notice("No transcript found for this video");
				return;
			}

			// Format transcript with timestamps based on settings
			const formattedTranscript = this.formatTranscript(transcript, url);

			// Insert at cursor position
			const cursorPos = editor.getCursor();
			editor.replaceRange(formattedTranscript, cursorPos);

			new Notice("Transcript inserted successfully");
		} catch (error) {
			console.error("Error fetching transcript:", error);
			new Notice("Failed to fetch transcript: " + (error instanceof Error ? error.message : "Unknown error"));
		}
	}

	formatTranscript(transcript: TranscriptResponse, url: string): string {
		// Extract video title
		const title = transcript.title || `YouTube Transcript`;

		let output = `## ${title}\n\n[Video Link](${url})\n\n`;

		// Process transcript entries
		transcript.lines.forEach((line, index) => {
			// Add timestamp based on timestampMod setting
			if (index % this.settings.timestampMod === 0) {
				const timestamp = this.formatTimestamp(line.offset / 1000); // Convert ms to seconds
				output += `**[${timestamp}]** `;
			}

			output += line.text + " ";

			// Add line breaks between paragraphs for readability
			if ((index + 1) % (this.settings.timestampMod * 2) === 0) {
				output += "\n\n";
			}
		});

		return output;
	}

	formatTimestamp(seconds: number): string {
		const hrs = Math.floor(seconds / 3600);
		const mins = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);

		if (hrs > 0) {
			return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
		} else {
			return `${mins}:${secs.toString().padStart(2, '0')}`;
		}
	}

	onunload() {
		// No special cleanup needed
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class YTranscriptSettingTab extends PluginSettingTab {
	plugin: YTranscriptPlugin;

	constructor(app: App, plugin: YTranscriptPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Settings for YTranscript" });

		new Setting(containerEl)
			.setName("Timestamp interval")
			.setDesc(
				"Indicates how often timestamp should occur in text (1 - every line, 10 - every 10 lines)"
			)
			.addText((text) =>
				text
				.setValue(this.plugin.settings.timestampMod.toFixed())
				.onChange(async (value) => {
					const v = Number.parseInt(value);
					this.plugin.settings.timestampMod = Number.isNaN(v)
						? 5
						: v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Language")
			.setDesc("Preferred transcript language")
			.addText((text) =>
				text
				.setValue(this.plugin.settings.lang)
				.onChange(async (value) => {
					this.plugin.settings.lang = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Country")
			.setDesc("Preferred transcript country code")
			.addText((text) =>
				text
				.setValue(this.plugin.settings.country)
				.onChange(async (value) => {
					this.plugin.settings.country = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
