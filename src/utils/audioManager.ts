import * as THREE from "three";
import { Audio, AudioListener, AudioLoader } from "three";
import { LoadingManager } from "./loadingManager";

export class AudioManager {
  private listener: AudioListener;
  private audioLoader: AudioLoader;

  public bgMusic: Audio;
  public runningSound: Audio;
  public walkingSound: Audio;
  public jumpingSound: Audio;
  public attackingSound: Audio;
  public breakingGlassSound: Audio;

  constructor(camera: THREE.PerspectiveCamera, loadingManager: LoadingManager) {
    this.listener = new AudioListener();
    camera.add(this.listener);

    this.audioLoader = new AudioLoader(loadingManager.getManager());

    this.bgMusic = new Audio(this.listener);
    this.runningSound = new Audio(this.listener);
    this.walkingSound = new Audio(this.listener);
    this.jumpingSound = new Audio(this.listener);
    this.attackingSound = new Audio(this.listener);
    this.breakingGlassSound = new Audio(this.listener);

    this.loadAudio();
  }

  private loadAudio(): void {
    this.audioLoader.load("/audio/background.mp3", (buffer) => {
      this.bgMusic.setBuffer(buffer);
      this.bgMusic.setLoop(true);
      this.bgMusic.setVolume(0.2);
      this.bgMusic.play();
    });

    this.audioLoader.load("/audio/running.mp3", (buffer) => {
      this.runningSound.setBuffer(buffer);
      this.runningSound.setLoop(true);
      this.runningSound.setVolume(0.5);
    });

    this.audioLoader.load("/audio/footsteps.mp3", (buffer) => {
      this.walkingSound.setBuffer(buffer);
      this.walkingSound.setLoop(true);
      this.walkingSound.setVolume(0.5);
    });

    this.audioLoader.load("/audio/jump.mp3", (buffer) => {
      this.jumpingSound.setBuffer(buffer);
      this.jumpingSound.setVolume(0.5);
    });

    this.audioLoader.load("/audio/attack.mp3", (buffer) => {
      this.attackingSound.setBuffer(buffer);
      this.attackingSound.setVolume(0.5);
    });

    this.audioLoader.load("/audio/break-glass.mp3", (buffer) => {
      this.breakingGlassSound.setBuffer(buffer);
      this.breakingGlassSound.setVolume(0.5);
    });
  }
}
