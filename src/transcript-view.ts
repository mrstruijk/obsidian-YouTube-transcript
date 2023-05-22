import YTranscriptPlugin from "src/main";
import { ItemView, WorkspaceLeaf, Menu } from "obsidian";
import { YoutubeTranscript } from "youtube-transcript";
import { formatTimestamp } from "./timestampt-utils";
import { getYouTubeVideoTitle } from "./url-utils";

export const TRANSCRIPT_TYPE_VIEW = "transcript-view";
export class TranscriptView extends ItemView {
	plugin: YTranscriptPlugin;
	innerContainerEl: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: YTranscriptPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h4", { text: "YouTube Transcript" });

		this.innerContainerEl = contentEl.createEl("div");
	}

	async onClose() {
		const leafIndex = this.getLeafIndex();
		this.plugin.settings.leafUrls.splice(leafIndex, 1);
	}

	/**
	 * Gets the leaf index out of all of the open leaves
	 * This assumes that the leaf order shouldn't changed, which is a fair assumption
	 */
	private getLeafIndex(): number {
		const leaves = this.app.workspace.getLeavesOfType(TRANSCRIPT_TYPE_VIEW);
		return leaves.findIndex((leaf) => leaf === this.leaf);
	}

	async setEphemeralState(state: any): Promise<void> {
		const leafIndex = this.getLeafIndex();

		//If we are opening a new url, save the url into settings
		if (state.url) {
			this.plugin.settings.leafUrls[leafIndex] = state.url;
			await this.plugin.saveSettings();
		}

		const { timestampMod, lang, country, leafUrls } = this.plugin.settings;
		const url = leafUrls[leafIndex];

		try {
			const videoTitle = await getYouTubeVideoTitle(url);
			const titleEl = this.innerContainerEl.createEl("div");
			titleEl.innerHTML = videoTitle;
			titleEl.style.fontWeight = "bold";
			titleEl.style.marginBottom = "10px";

			const data = await YoutubeTranscript.fetchTranscript(url, {
				lang,
				country,
			});
			if (!data) {
				this.innerContainerEl.empty();
				this.innerContainerEl.createEl("h4", {
					text: "No transcript found",
				});
				this.innerContainerEl.createEl("div", {
					text: "Please check if video contains any transcript or try adjust language and country in plugin settings.",
				});
				return;
			}

			const handleDrag = (quote: string) => {
				return (event: DragEvent) => {
					event.dataTransfer?.setData("text/plain", quote);
				};
			};

			var quote = "";
			var quoteTimeOffset = 0;
			data.forEach((line, i) => {
				if (i === 0) {
					quoteTimeOffset = line.offset;
					quote += line.text + " ";
					return;
				}
				if (i % timestampMod == 0) {
					const div = createEl("div", { cls: "transcript-block" });

					const button = createEl("button", {
						cls: "timestamp",
						attr: { "data-timestamp": quoteTimeOffset.toFixed() },
					});
					const link = createEl("a", {
						text: formatTimestamp(quoteTimeOffset),
						attr: {
							href:
								url +
								"&t=" +
								Math.floor(quoteTimeOffset / 1000),
						},
					});
					button.appendChild(link);

					const span = this.innerContainerEl.createEl("span", {
						cls: "transcript-line",
						text: quote,
					});
					span.setAttr("draggable", "true");
					span.addEventListener("dragstart", handleDrag(quote));

					div.appendChild(button);
					div.appendChild(span);
					div.addEventListener("contextmenu", (event: MouseEvent) => {
						const menu = new Menu();
						menu.addItem((item) =>
							item.setTitle("Copy all").onClick(() => {
								navigator.clipboard.writeText(
									data.map((t) => t.text).join(" ")
								);
							})
						);
						menu.showAtPosition({
							x: event.clientX,
							y: event.clientY,
						});
					});
					this.innerContainerEl.appendChild(div);

					quote = "";
					quoteTimeOffset = line.offset;
				}
				quote += line.text + " ";
			});
		} catch (err) {
			this.innerContainerEl.empty();
			this.innerContainerEl.createEl("h4", { text: "Error" });
			this.innerContainerEl.createEl("div", { text: err });
		}
	}

	getViewType(): string {
		return TRANSCRIPT_TYPE_VIEW;
	}
	getDisplayText(): string {
		return "YouTube Transcript";
	}
	getIcon(): string {
		return "scroll";
	}
}
