export class RenderManager {
  constructor({
    pixelRenderer,
    hologramEngine,
    holographicPane,
    pixelPane,
    holographicButton,
    pixelButton
  }) {
    this.pixelRenderer = pixelRenderer;
    this.hologramEngine = hologramEngine;
    this.holographicPane = holographicPane;
    this.pixelPane = pixelPane;
    this.holographicButton = holographicButton;
    this.pixelButton = pixelButton;
    this.mode = "holographic";
  }

  setMode(nextMode) {
    this.mode = nextMode;
    const holographic = this.mode === "holographic";
    this.holographicPane.classList.toggle("hidden", !holographic);
    this.pixelPane.classList.toggle("hidden", holographic);
    this.holographicButton.classList.toggle("active", holographic);
    this.pixelButton.classList.toggle("active", !holographic);
  }

  render(snapshot, time) {
    if (this.mode === "holographic") {
      this.hologramEngine.render(time);
    } else {
      this.pixelRenderer.render(snapshot, time);
    }
  }
}

export default RenderManager;
