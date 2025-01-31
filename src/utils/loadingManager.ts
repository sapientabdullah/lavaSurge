import * as THREE from "three";

export class LoadingManager {
  private loadingManager: THREE.LoadingManager;
  private loadingScreen: HTMLElement;
  private progressBar: HTMLElement;
  private progressText: HTMLElement;

  constructor() {
    this.loadingScreen = document.getElementById("loading-screen")!;
    this.progressBar = document.getElementById("progress-bar")!;
    this.progressText = document.getElementById("progress-text")!;

    this.loadingManager = new THREE.LoadingManager(
      () => {
        this.loadingScreen.style.display = "none";
        if (this.onLoadCallback) {
          this.onLoadCallback();
        }
      },
      (_url, itemsLoaded, itemsTotal) => {
        const progress = (itemsLoaded / itemsTotal) * 100;
        this.progressBar.style.width = `${progress}%`;
        this.progressText.textContent = `${Math.round(progress)}%`;
      },
      (url) => {
        console.error(`Error loading ${url}`);
      }
    );
  }

  private onLoadCallback: () => void = () => {};

  public setOnLoadCallback(callback: () => void): void {
    this.onLoadCallback = callback;
  }

  public getManager(): THREE.LoadingManager {
    return this.loadingManager;
  }
}
