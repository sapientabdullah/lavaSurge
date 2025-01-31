import "./style.css";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { EffectComposer } from "three/examples/jsm/Addons.js";
import { RenderPass } from "three/examples/jsm/Addons.js";
import { BloomPass } from "three/examples/jsm/Addons.js";
import { OutputPass } from "three/examples/jsm/Addons.js";
import { RGBELoader } from "three/examples/jsm/Addons.js";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { ShaderPass } from "three/examples/jsm/Addons.js";
import { vignetteShader } from "./shaders/vignetteShader";
import { speedLinesShader } from "./shaders/speedLinesShader";
import { fragmentShader, vertexShader } from "./shaders/lavaShader";
import { Platforms } from "./utils/platforms";
import { Enemy } from "./utils/enemy";
import { AudioManager } from "./utils/audioManager";
import { LoadingManager } from "./utils/loadingManager";

export class Game {
  private loadingManager: LoadingManager;
  private audioManager: AudioManager;

  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private clock: THREE.Clock;
  private uniforms: { [uniform: string]: THREE.IUniform };
  private ground: THREE.Mesh;
  private scene: THREE.Scene;

  private world: CANNON.World;
  private playerBody: CANNON.Body;
  private armsModel: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private jumpAction: THREE.AnimationAction | null = null;
  private attackAnimations: THREE.AnimationAction[] = [];
  private isAttacking = false;

  private runAction: THREE.AnimationAction | null = null;
  private currentMainAction: THREE.AnimationAction | null = null;
  private animationTransitionDuration = 0.15;

  private glassEnemies: Enemy;

  private platforms: Platforms;

  private currentRotationVelocity = new THREE.Vector2(0, 0);
  private readonly rotationAcceleration = 8.0;
  private readonly rotationDamping = 0.85;
  private readonly maxRotationVelocity = 0.1;
  private mouseSensitivity = 0.05;

  private rotationX = 0; // up/down
  private rotationY = 0; // left/right

  private attackRaycaster: THREE.Raycaster;
  private attackRange = 3; // attack reach

  private speedLinesPass: ShaderPass;
  private currentSpeedLineIntensity = 0;
  private targetSpeedLineIntensity = 0;

  private screenShakeIntensity = 0;
  private maxScreenShakeIntensity = 0.2;
  private screenShakeDamping = 0.95; // damping for smoother decay

  private landingImpactStartTime = 0;
  private isLandingAnimation = false;
  private landingCameraOffset = 0;
  private landingImpactDuration = 500;
  private landingImpactStrength = 0.3; // maximum displacement
  private landingSmoothing = 0.15; // controls how smooth the landing animation is
  private landingBounceFactor = 0.3; // controls the bounce intensity

  private isGrappling = false;
  private grapplingTarget: THREE.Vector3 | null = null;
  private grappleRange = 30; // maximum grapple distance
  private grappleSpeed = 20; // grapple pull speed
  private ropeGeometry: THREE.BufferGeometry | null = null;
  private ropeMaterial: THREE.LineBasicMaterial | null = null;
  private ropeLine: THREE.Line | null = null;
  private canGrapple = true;
  private grappleCooldown = 1000;

  private grappleFOV = 60;
  private currentGrappleSpeed = 0;
  private grappleAcceleration = 15; // acceleration rate

  private vignettePass: ShaderPass;
  private currentVignetteIntensity = 0;
  private targetVignetteIntensity = 0;

  private defaultFOV = 75;
  private sprintFOV = 85;
  private currentFOV = 75;
  private fovTransitionSpeed = 0.1;

  private jumpFOV = 85;
  private jumpTilt = 0.1; // camera tilt during jump
  private isJumping = false;
  private jumpStartTime = 0;
  private jumpDuration = 1000;

  private bobAmount = 0;
  private bobSpeed = 0;
  private bobOffset = 0;

  private moveState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
  };

  private moveSpeed = 5;
  private sprintSpeed = 12;
  private jumpForce = 10;
  private canJump = false;
  private reticle: HTMLElement;

  private paused: boolean = false;
  private animationId: number | null = null; // animation loop ID

  constructor() {
    this.loadingManager = new LoadingManager();

    this.loadingManager.setOnLoadCallback(() => {
      this.startAnimation();

      this.showControls();

      setTimeout(() => {
        this.hideControls();
      }, 5000);
    });

    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -20, 0),
    });
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    this.audioManager = new AudioManager(this.camera, this.loadingManager);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    this.glassEnemies = new Enemy(this.scene, this.world);

    const playerShape = new CANNON.Sphere(0.5);
    this.playerBody = new CANNON.Body({
      mass: 5,
      shape: playerShape,
      position: new CANNON.Vec3(0, 5, 0),
    });
    this.world.addBody(this.playerBody);

    this.attackRaycaster = new THREE.Raycaster();

    this.resetPlayer();

    new RGBELoader(this.loadingManager.getManager()).load(
      "/environment.hdr",
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        this.scene.background = texture;
        this.scene.environment = texture;
      }
    );

    this.renderer.domElement.addEventListener("click", () => {
      this.renderer.domElement.requestPointerLock();
    });

    this.playerBody.addEventListener("position", (event: any) => {
      if (event.target.position.y < -2) {
        this.resetPlayer();
      }
    });

    document.addEventListener("keydown", (e) => this.onKeyDown(e));
    document.addEventListener("keyup", (e) => this.onKeyUp(e));
    document.addEventListener("mousemove", (e) => this.onMouseMove(e));
    document.addEventListener("click", () => this.onClick());

    this.reticle = document.querySelector(".reticle")!;

    const textureLoader = new THREE.TextureLoader(
      this.loadingManager.getManager()
    );
    const cloudTexture = textureLoader.load("/textures/lava-cloud.png");
    const lavaTexture = textureLoader.load("/textures/lava-tile.jpg");

    lavaTexture.colorSpace = THREE.SRGBColorSpace;
    cloudTexture.wrapS = cloudTexture.wrapT = THREE.RepeatWrapping;
    lavaTexture.wrapS = lavaTexture.wrapT = THREE.RepeatWrapping;

    this.uniforms = {
      fogColor: { value: new THREE.Vector3(0, 0, 0) },
      time: { value: 1.0 },
      uvScale: { value: new THREE.Vector2(3.0, 1.0) },
      texture1: { value: cloudTexture },
      texture2: { value: lavaTexture },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
    });

    const groundGeometry = new THREE.PlaneGeometry(200, 200, 512, 512);
    const positionAttribute = groundGeometry.getAttribute("position");
    for (let i = 0; i < positionAttribute.count; i++) {
      const x = positionAttribute.getX(i);
      const y = positionAttribute.getY(i);
      const z = positionAttribute.getZ(i);

      positionAttribute.setY(
        i,
        y +
          Math.sin(x * 2) * Math.cos(z * 2) * 0.5 +
          Math.sin(x * 4) * Math.cos(z * 4) * 0.25
      );
    }
    groundGeometry.computeVertexNormals();
    this.ground = new THREE.Mesh(groundGeometry, material);

    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -2;
    this.scene.add(this.ground);

    const renderModel = new RenderPass(this.scene, this.camera);
    const effectBloom = new BloomPass(1.25);
    const outputPass = new OutputPass();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderModel);
    this.composer.addPass(effectBloom);

    this.speedLinesPass = new ShaderPass(speedLinesShader);
    this.composer.addPass(this.speedLinesPass);

    this.composer.addPass(outputPass);

    this.vignettePass = new ShaderPass(vignetteShader);
    this.composer.addPass(this.vignettePass);

    this.platforms = new Platforms(this.scene, this.world);
    this.platforms.initializePlatforms();

    const loader = new GLTFLoader(this.loadingManager.getManager());
    loader.load(
      "/models/player/scene.gltf",
      (gltf) => {
        this.armsModel = gltf.scene;
        this.armsModel.scale.set(1, 1, 1);
        this.scene.add(this.armsModel);

        this.mixer = new THREE.AnimationMixer(this.armsModel);
        const animations = gltf.animations;

        // idle animation
        const idleAnimation = animations.find(
          (animation) => animation.name === "axe_IDLE"
        );
        if (idleAnimation) {
          this.idleAction = this.mixer.clipAction(idleAnimation);
          this.idleAction.play();
        }

        // jump animation
        const jumpAnimation = animations.find(
          (animation) => animation.name === "axe_JUMP"
        );
        if (jumpAnimation) {
          this.jumpAction = this.mixer.clipAction(jumpAnimation);
        }

        // Load run animation
        const runAnimation = animations.find(
          (animation) => animation.name === "axe_RUN"
        );
        if (runAnimation) {
          this.runAction = this.mixer.clipAction(runAnimation);
          this.runAction.setLoop(THREE.LoopRepeat, Infinity);
        }

        // attack animations
        const attackAnimationNames = ["axe_ATK1(hit)", "axe_ATK2(hit)"];
        attackAnimationNames.forEach((animationName) => {
          const attackAnimation = animations.find(
            (animation) => animation.name === animationName
          );
          if (attackAnimation) {
            const attackAction = this.mixer!.clipAction(attackAnimation);
            attackAction.setLoop(THREE.LoopOnce, 1);
            attackAction.clampWhenFinished = true;
            attackAction.timeScale = 3.0;
            this.attackAnimations.push(attackAction);
          }
        });
      },
      undefined,
      (error) => {
        console.error("Error loading the model:", error);
      }
    );

    this.ropeMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 20,
    });
    this.ropeGeometry = new THREE.BufferGeometry();
    this.ropeLine = new THREE.Line(this.ropeGeometry, this.ropeMaterial);
    this.scene.add(this.ropeLine);

    window.addEventListener("resize", () => this.onWindowResize());
  }

  private showControls(): void {
    const controlsOverlay = document.getElementById("controlsOverlay");
    if (controlsOverlay) {
      controlsOverlay.classList.add("visible"); // Add the 'visible' class to show the overlay
    }
  }

  private hideControls(): void {
    const controlsOverlay = document.getElementById("controlsOverlay");
    if (controlsOverlay) {
      controlsOverlay.classList.remove("visible"); // Remove the 'visible' class to hide the overlay
    }
  }

  private findNearestPlatform(): THREE.Vector3 | null {
    if (!this.playerBody) return null;

    const playerPos = new THREE.Vector3(
      this.playerBody.position.x,
      this.playerBody.position.y,
      this.playerBody.position.z
    );

    const platforms = this.platforms.getPlatforms();
    let nearestPoint: THREE.Vector3 | null = null;
    let shortestDistance = this.grappleRange;

    platforms.forEach((platform) => {
      const platformPos = platform.mesh.position.clone();
      platformPos.y += 1;

      const distance = playerPos.distanceTo(platformPos);
      if (distance < shortestDistance) {
        const direction = platformPos.clone().sub(playerPos).normalize();
        this.attackRaycaster.set(playerPos, direction);
        const intersects = this.attackRaycaster.intersectObjects(
          platforms.map((p) => p.mesh),
          false
        );

        if (intersects.length > 0 && intersects[0].object === platform.mesh) {
          shortestDistance = distance;
          nearestPoint = platformPos;
        }
      }
    });

    return nearestPoint;
  }

  private updateGrapple(): void {
    if (!this.isGrappling || !this.grapplingTarget) return;

    const delta = this.clock.getDelta();
    const playerPos = new THREE.Vector3(
      this.playerBody.position.x,
      this.playerBody.position.y,
      this.playerBody.position.z
    );

    const points = [playerPos, this.grapplingTarget];
    this.ropeGeometry?.setFromPoints(points);

    const direction = this.grapplingTarget.clone().sub(playerPos).normalize();
    this.currentGrappleSpeed += this.grappleAcceleration * delta;

    const velocity = direction.multiplyScalar(this.currentGrappleSpeed);
    this.playerBody.velocity.set(velocity.x, velocity.y, velocity.z);

    const horizontalVelocity = new THREE.Vector3(
      this.playerBody.velocity.x,
      0,
      this.playerBody.velocity.z
    ).normalize();
    const tiltAmount = horizontalVelocity.x * 0.3;
    this.camera.rotation.z = THREE.MathUtils.lerp(
      this.camera.rotation.z,
      tiltAmount,
      0.1
    );

    if (playerPos.distanceTo(this.grapplingTarget) < 2) {
      this.endGrapple();
    }
  }

  private startGrapple(): void {
    if (!this.canGrapple || this.isGrappling) return;

    const target = this.findNearestPlatform();
    if (target) {
      this.isGrappling = true;
      this.grapplingTarget = target;
      this.canGrapple = false;
      this.currentGrappleSpeed = this.grappleSpeed;

      this.screenShakeIntensity = 0.2;
      this.targetVignetteIntensity = 0.5;
      this.targetSpeedLineIntensity = 3.0;

      setTimeout(() => {
        this.canGrapple = true;
      }, this.grappleCooldown);
    }
  }

  private endGrapple(): void {
    this.isGrappling = false;
    this.grapplingTarget = null;
    this.ropeGeometry?.setFromPoints([]);
    this.currentGrappleSpeed = 0;
    this.targetVignetteIntensity = 0.0;
    this.targetSpeedLineIntensity = 0.0;
  }

  private updateSpeedLines(): void {
    this.targetSpeedLineIntensity =
      this.moveState.sprint &&
      (this.moveState.forward ||
        this.moveState.backward ||
        this.moveState.left ||
        this.moveState.right)
        ? 2.0 // speed lines strength
        : 0.0;

    this.currentSpeedLineIntensity = this.updateEffect(
      this.targetSpeedLineIntensity,
      this.currentSpeedLineIntensity,
      this.speedLinesPass.uniforms.speed,
      0.2
    );

    this.speedLinesPass.uniforms.time.value += this.clock.getDelta() * 2.0;
  }

  private updateVignetteEffect(): void {
    this.targetVignetteIntensity =
      this.moveState.sprint &&
      (this.moveState.forward ||
        this.moveState.backward ||
        this.moveState.left ||
        this.moveState.right)
        ? 0.2 // vignette strength
        : 0.0;

    this.currentVignetteIntensity = this.updateEffect(
      this.targetVignetteIntensity,
      this.currentVignetteIntensity,
      this.vignettePass.uniforms.intensity,
      0.1
    );
  }

  private updateEffect(
    targetIntensity: number,
    currentIntensity: number,
    uniform: { value: number },
    deltaMultiplier: number = 1.0
  ): number {
    const newIntensity =
      currentIntensity + (targetIntensity - currentIntensity) * deltaMultiplier;
    uniform.value = newIntensity;
    return newIntensity;
  }

  private updatePlayerAnimation(): void {
    if (!this.mixer || !this.idleAction || !this.runAction) return;

    if (this.isJumping) return;

    const isMoving =
      this.moveState.forward ||
      this.moveState.backward ||
      this.moveState.left ||
      this.moveState.right;

    if (this.isAttacking) {
      this.idleAction.weight = 0;
      this.runAction.weight = 0;
    } else if (isMoving) {
      if (this.currentMainAction !== this.runAction) {
        if (this.currentMainAction) {
          this.currentMainAction.crossFadeTo(
            this.runAction,
            this.animationTransitionDuration,
            true
          );
        }
        this.runAction.enabled = true;
        this.runAction.reset();
        this.runAction.play();
        this.currentMainAction = this.runAction;

        if (this.moveState.sprint) {
          if (!this.audioManager.runningSound.isPlaying) {
            this.audioManager.runningSound.play();
          }
          if (this.audioManager.walkingSound.isPlaying) {
            this.audioManager.walkingSound.stop();
          }
        } else {
          if (!this.audioManager.walkingSound.isPlaying) {
            this.audioManager.walkingSound.play();
          }
          if (this.audioManager.runningSound.isPlaying) {
            this.audioManager.runningSound.stop();
          }
        }
      }
      this.runAction.timeScale = this.moveState.sprint ? 1.5 : 1.0;
    } else {
      if (this.currentMainAction !== this.idleAction) {
        if (this.currentMainAction) {
          this.currentMainAction.crossFadeTo(
            this.idleAction,
            this.animationTransitionDuration,
            true
          );
        }
        this.idleAction.enabled = true;
        this.idleAction.reset();
        this.idleAction.play();
        this.currentMainAction = this.idleAction;

        if (this.audioManager.runningSound.isPlaying) {
          this.audioManager.runningSound.stop();
        }
        if (this.audioManager.walkingSound.isPlaying) {
          this.audioManager.walkingSound.stop();
        }
      }
    }
  }

  private updateSpeedEffect(): void {
    let targetFOV = this.defaultFOV;
    if (this.isGrappling) {
      targetFOV = this.grappleFOV;
    } else if (this.moveState.sprint) {
      targetFOV = this.sprintFOV;
    }

    this.currentFOV += (targetFOV - this.currentFOV) * this.fovTransitionSpeed;
    this.camera.fov = this.currentFOV;
    this.camera.updateProjectionMatrix();

    if (
      this.moveState.sprint &&
      (this.moveState.forward ||
        this.moveState.backward ||
        this.moveState.left ||
        this.moveState.right)
    ) {
      this.bobAmount = Math.sin(this.bobOffset) * 0.08;

      let tiltAmount = 0;

      if (this.moveState.forward) tiltAmount += 0.05;
      if (this.moveState.backward) tiltAmount -= 0.05;
      if (this.moveState.right) tiltAmount += 0.03;
      if (this.moveState.left) tiltAmount -= 0.03;

      this.camera.rotation.z = THREE.MathUtils.lerp(
        this.camera.rotation.z,
        tiltAmount,
        0.1
      );
    } else {
      this.camera.rotation.z = THREE.MathUtils.lerp(
        this.camera.rotation.z,
        0,
        0.1
      );
    }
  }

  private updateScreenShake(): void {
    if (this.screenShakeIntensity > 0) {
      const shakeX = (Math.random() - 0.5) * this.screenShakeIntensity;
      const shakeY = (Math.random() - 0.5) * this.screenShakeIntensity;

      this.camera.position.x += shakeX;
      this.camera.position.y += shakeY;

      this.screenShakeIntensity *= this.screenShakeDamping;
    }
  }

  private updateGroundPosition(): void {
    const groundPosition = this.playerBody.position.clone();
    groundPosition.y = -2;
    this.ground.position.set(
      groundPosition.x,
      groundPosition.y,
      groundPosition.z
    );

    this.uniforms.time.value += this.clock.getDelta();
    this.uniforms.uvScale.value.x = groundPosition.x / 10;
    this.uniforms.uvScale.value.y = groundPosition.z / 10;
  }

  private onClick(): void {
    if (!this.isAttacking && this.attackAnimations.length > 0) {
      this.isAttacking = true;

      const randomIndex = Math.floor(
        Math.random() * this.attackAnimations.length
      );
      const chosenAttackAction = this.attackAnimations[randomIndex];

      chosenAttackAction.reset();
      chosenAttackAction.play();

      if (this.audioManager.attackingSound.isPlaying) {
        this.audioManager.attackingSound.stop();
      }
      this.audioManager.attackingSound.play();

      this.performAttack();

      setTimeout(() => {
        this.isAttacking = false;
      }, chosenAttackAction.getEffectiveTimeScale() * 100);
    }
  }

  private performAttack(): void {
    this.attackRaycaster.set(
      this.camera.position,
      new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    );

    const enemies = this.glassEnemies.getEnemies();
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      const intersects = this.attackRaycaster.intersectObject(enemy.mesh);

      if (intersects.length > 0 && intersects[0].distance <= this.attackRange) {
        this.glassEnemies.damageEnemy(i, 100);
        this.screenShakeIntensity = 0.1;
        break;
      }
    }

    const platforms = this.platforms.getPlatforms();
    const intersects = this.attackRaycaster.intersectObjects(
      platforms.flatMap(
        (p) => [p.mesh, p.glassWall?.mesh].filter(Boolean) as THREE.Mesh[]
      ),
      false
    );

    for (const hit of intersects) {
      if (hit.distance <= this.attackRange) {
        const hitPlatform = platforms.find(
          (p) => p.mesh === hit.object || p.glassWall?.mesh === hit.object
        );
        if (hitPlatform) {
          if (hit.object === hitPlatform.glassWall?.mesh) {
            this.damageGlassWall(hitPlatform);
          } else {
            this.damagePlatform(hitPlatform);
          }
        }
      }
    }
  }

  private damageGlassWall(platform: Platform): void {
    if (!platform.glassWall) return;

    platform.glassWall.health -= 100; // glass damage

    const material = platform.glassWall.mesh
      .material as THREE.MeshPhysicalMaterial;
    material.opacity = (platform.glassWall.health / 100) * 0.3;
    material.transmission = (platform.glassWall.health / 100) * 0.9;

    if (platform.glassWall.health <= 0) {
      this.scene.remove(platform.glassWall.mesh);
      this.world.removeBody(platform.glassWall.body);
      this.createGlassBreakEffect(platform.glassWall.mesh.position);

      if (this.audioManager.breakingGlassSound.isPlaying) {
        this.audioManager.breakingGlassSound.stop();
      }
      this.audioManager.breakingGlassSound.play();

      delete platform.glassWall;
    }

    this.screenShakeIntensity = Math.min(
      this.screenShakeIntensity + 0.05,
      this.maxScreenShakeIntensity
    );
  }

  private createGlassBreakEffect(position: THREE.Vector3): void {
    const shardCount = 100;
    interface Shard {
      shard: THREE.Mesh;
      velocity: THREE.Vector3;
    }
    const shards: Shard[] = [];

    const shardGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      0, 1, 0, -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5,
    ]);
    shardGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(vertices, 3)
    );
    shardGeometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]);
    shardGeometry.computeVertexNormals();

    for (let i = 0; i < shardCount; i++) {
      const shardMaterial = new THREE.MeshPhongMaterial({
        color: new THREE.Color(
          0.8 + Math.random() * 0.2,
          0.9 + Math.random() * 0.1,
          1.0
        ),
        specular: 0xffffff, // specular reflection
        shininess: 100,
        transparent: true,
        opacity: 0.8,
      });

      const shard = new THREE.Mesh(shardGeometry, shardMaterial);

      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * Math.PI;
      const radius = 0.1 + Math.random() * 0.5;

      shard.position.set(
        position.x + radius * Math.sin(phi) * Math.cos(theta),
        position.y + radius * Math.sin(phi) * Math.sin(theta),
        position.z + radius * Math.cos(phi)
      );

      shard.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      shard.scale.setScalar(0.02 + Math.random() * 0.03); // shard size variation

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        Math.random() * 0.3,
        (Math.random() - 0.5) * 0.2
      );
      shards.push({ shard, velocity });

      this.scene.add(shard);
    }

    const startTime = Date.now();
    const gravity = -0.005;

    const animate = () => {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > 2000) {
        shards.forEach(({ shard }) => this.scene.remove(shard));
        return;
      }

      shards.forEach(({ shard, velocity }) => {
        shard.position.add(velocity);
        velocity.y += gravity;

        (shard.material as THREE.MeshPhongMaterial).opacity =
          0.8 * (1 - elapsedTime / 2000);
      });

      requestAnimationFrame(animate);
    };

    animate();
  }

  private damagePlatform(platform: Platform): void {
    let health = this.platforms.getPlatformHealth(platform.body);
    health -= 34;
    this.platforms.setPlatformHealth(platform.body, health);

    const material = platform.mesh.material as THREE.MeshStandardMaterial;
    material.opacity = health / 100;

    if (health <= 0) {
      this.platforms.removePlatform(platform);
      this.createDestructionEffect(platform.mesh.position);
    }

    this.screenShakeIntensity = Math.min(
      this.screenShakeIntensity + 0.1,
      this.maxScreenShakeIntensity
    );
  }

  private createDestructionEffect(position: THREE.Vector3): void {
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = position.x + (Math.random() - 0.5) * 2;
      positions[i + 1] = position.y + (Math.random() - 0.5) * 2;
      positions[i + 2] = position.z + (Math.random() - 0.5) * 2;

      colors[i] = 0.5 + Math.random() * 0.2;
      colors[i + 1] = 0.5 + Math.random() * 0.2;
      colors[i + 2] = 0.5 + Math.random() * 0.2;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 1,
    });

    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);

    const startTime = Date.now();
    const animate = () => {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > 1000) {
        this.scene.remove(particles);
        return;
      }

      const positions = geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += (Math.random() - 0.5) * 0.1;
        positions[i + 1] += 0.1;
        positions[i + 2] += (Math.random() - 0.5) * 0.1;
      }
      geometry.attributes.position.needsUpdate = true;

      material.opacity = 1 - elapsedTime / 1000;

      requestAnimationFrame(animate);
    };
    animate();
  }

  private resetPlayer(): void {
    this.playerBody.position.set(0, 5, 0);
    this.playerBody.velocity.setZero();
    this.playerBody.angularVelocity.setZero();
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  private onKeyDown(event: KeyboardEvent): void {
    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        this.moveState.forward = true;
        break;
      case "KeyS":
      case "ArrowDown":
        this.moveState.backward = true;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.moveState.sprint = true;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.moveState.left = true;
        break;
      case "KeyD":
      case "ArrowRight":
        this.moveState.right = true;
        break;
      case "KeyE":
        if (this.canGrapple && !this.isGrappling) {
          this.startGrapple();
        }
        break;
      case "KeyP":
        this.paused = !this.paused;
        if (this.paused) {
          if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
          }
        } else {
          this.startAnimation();
        }
        break;
      case "Space":
        if (this.canJump) {
          this.moveState.jump = true;
          this.playerBody.velocity.y = this.jumpForce;
          this.canJump = false;
          this.isJumping = true;
          this.jumpStartTime = Date.now();

          this.currentFOV = this.jumpFOV;
          this.camera.fov = this.currentFOV;
          this.camera.updateProjectionMatrix();

          this.targetVignetteIntensity = 0.3;
          this.reticle.classList.add("jumping");

          if (this.audioManager.jumpingSound.isPlaying) {
            this.audioManager.jumpingSound.stop();
          }
          this.audioManager.jumpingSound.play();

          if (this.jumpAction && this.mixer) {
            this.currentMainAction =
              this.moveState.forward ||
              this.moveState.backward ||
              this.moveState.left ||
              this.moveState.right
                ? this.runAction
                : this.idleAction;

            if (this.currentMainAction) {
              this.currentMainAction.crossFadeTo(
                this.jumpAction,
                this.animationTransitionDuration,
                true
              );
            }
            if (this.runAction) {
              this.runAction.enabled = false;
            }
            if (this.idleAction) {
              this.idleAction.enabled = false;
            }

            this.jumpAction.reset();
            this.jumpAction.setLoop(THREE.LoopOnce, 1);
            this.jumpAction.clampWhenFinished = true;
            this.jumpAction.play();

            const jumpDuration = 1550;
            setTimeout(() => {
              if (this.jumpAction && this.currentMainAction && this.mixer) {
                this.currentMainAction.enabled = true;
                if (this.runAction) this.runAction.enabled = true;
                if (this.idleAction) this.idleAction.enabled = true;

                this.jumpAction.crossFadeTo(
                  this.currentMainAction,
                  this.animationTransitionDuration,
                  true
                );
                this.currentMainAction.reset();
                this.currentMainAction.play();

                this.reticle.classList.remove("jumping");
                this.updatePlayerAnimation();
              }
            }, jumpDuration);
          }
        }
        break;
    }
  }

  private updateJumpEffects(): void {
    if (this.isJumping) {
      const jumpProgress =
        (Date.now() - this.jumpStartTime) / this.jumpDuration;

      const tiltAmount = Math.sin(jumpProgress * Math.PI) * this.jumpTilt;
      this.camera.rotation.z = tiltAmount;

      this.currentFOV = THREE.MathUtils.lerp(
        this.currentFOV,
        this.defaultFOV,
        0.05
      );
      this.camera.fov = this.currentFOV;
      this.camera.updateProjectionMatrix();

      if (this.canJump && this.playerBody.velocity.y < 0.1) {
        this.isJumping = false;
        this.isLandingAnimation = true;
        this.landingImpactStartTime = Date.now();
        this.targetVignetteIntensity = 0;

        const impactVelocity = Math.abs(this.playerBody.velocity.y);
        this.landingImpactStrength = Math.min(
          Math.pow(impactVelocity * 0.04, 1.5),
          0.4
        );

        this.createLandingEffect(
          new THREE.Vector3(
            this.playerBody.position.x,
            this.playerBody.position.y,
            this.playerBody.position.z
          )
        );
      }
    }

    if (this.isLandingAnimation) {
      const elapsed = Date.now() - this.landingImpactStartTime;
      const progress = elapsed / this.landingImpactDuration;

      if (progress >= 1) {
        this.isLandingAnimation = false;
        this.landingCameraOffset = 0;
      } else {
        const easeOutElastic = (t: number): number => {
          const p = 0.3; // period
          return (
            Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) +
            1
          );
        };

        const bounceProgress = easeOutElastic(progress);
        const decay = Math.exp(-progress * 2);

        const targetOffset =
          bounceProgress *
          this.landingImpactStrength *
          decay *
          this.landingBounceFactor;

        this.landingCameraOffset +=
          (targetOffset - this.landingCameraOffset) * this.landingSmoothing;
      }
    }
  }

  private createLandingEffect(position: THREE.Vector3): void {
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.5 + Math.random() * 2; // varied radius
      positions[i] = position.x + Math.cos(angle) * radius;
      positions[i + 1] = position.y;
      positions[i + 2] = position.z + Math.sin(angle) * radius;

      const brightness = 0.7 + Math.random() * 0.3;
      colors[i] = brightness;
      colors[i + 1] = brightness;
      colors[i + 2] = brightness;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
    });

    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);

    const startTime = Date.now();
    const duration = 800; // particles duration

    const animate = () => {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > duration) {
        this.scene.remove(particles);
        return;
      }

      const progress = elapsedTime / duration;
      const positions = geometry.attributes.position.array as Float32Array;

      for (let i = 0; i < positions.length; i += 3) {
        const angle = Math.atan2(
          positions[i + 2] - position.z,
          positions[i] - position.x
        );
        const speed = 0.03 * (1 - progress);

        positions[i] += Math.cos(angle) * speed;
        positions[i + 1] += 0.05 * (1 - progress);
        positions[i + 2] += Math.sin(angle) * speed;
      }

      geometry.attributes.position.needsUpdate = true;

      material.opacity = 0.8 * Math.pow(1 - progress, 1.5);

      requestAnimationFrame(animate);
    };

    animate();
  }

  private onKeyUp(event: KeyboardEvent): void {
    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        this.moveState.forward = false;
        break;
      case "KeyS":
      case "ArrowDown":
        this.moveState.backward = false;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.moveState.sprint = false;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.moveState.left = false;
        break;
      case "KeyD":
      case "ArrowRight":
        this.moveState.right = false;
        break;
    }
    if (event.code === "Space") {
      this.moveState.jump = false;
    }
  }

  private updatePhysics(): void {
    this.world.step(1 / 60);

    if (this.playerBody.position.y < -1.5) {
      this.gameOver();
    }

    if (this.armsModel) {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
        this.camera.quaternion
      );
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(
        this.camera.quaternion
      );
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
        this.camera.quaternion
      );

      const position = new THREE.Vector3()
        .copy(this.camera.position)
        .add(forward.multiplyScalar(0.5)) // forward/backward
        .add(right.multiplyScalar(0)) // left/right
        .add(up.multiplyScalar(-2)); // up/down

      this.armsModel.position.copy(position);
      this.armsModel.quaternion.copy(this.camera.quaternion);

      this.armsModel.rotateY(Math.PI);
      this.armsModel.rotateX(-0.2);
    }

    const cameraOffset = new THREE.Vector3(0, 1.5, -0.2);
    this.camera.position.copy(this.playerBody.position).add(cameraOffset);

    const contacts = this.world.contacts;
    this.canJump = false;

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      if (
        (contact.bi === this.playerBody && contact.bj.mass === 0) ||
        (contact.bj === this.playerBody && contact.bi.mass === 0)
      ) {
        const normalY = contact.ni.y;
        if (Math.abs(normalY) > 0.5) {
          this.canJump = true;
          break;
        }
      }
    }
  }

  private gameOver(): void {
    this.paused = true;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    document.exitPointerLock();

    const gameOverScreen = document.getElementById("gameOverScreen");
    if (gameOverScreen) {
      gameOverScreen.classList.add("visible");
    }

    const restartButton = document.getElementById("restartButton");
    if (restartButton) {
      restartButton.addEventListener("click", () => this.restartGame());
    }
  }

  private restartGame(): void {
    window.location.reload();
  }

  private updateMovement(): void {
    const forward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.camera.quaternion)
      .setY(0)
      .normalize();
    const right = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(this.camera.quaternion)
      .setY(0)
      .normalize();

    const velocity = new CANNON.Vec3();

    if (this.moveState.forward)
      velocity.vadd(new CANNON.Vec3(forward.x, 0, forward.z), velocity);
    if (this.moveState.backward)
      velocity.vsub(new CANNON.Vec3(forward.x, 0, forward.z), velocity);
    if (this.moveState.right)
      velocity.vadd(new CANNON.Vec3(right.x, 0, right.z), velocity);
    if (this.moveState.left)
      velocity.vsub(new CANNON.Vec3(right.x, 0, right.z), velocity);

    if (velocity.length() > 0) {
      velocity.normalize();
      velocity.scale(
        this.moveState.sprint ? this.sprintSpeed : this.moveSpeed,
        velocity
      );
    }

    this.playerBody.velocity.x = velocity.x;
    this.playerBody.velocity.z = velocity.z;

    if (
      this.moveState.forward ||
      this.moveState.backward ||
      this.moveState.left ||
      this.moveState.right
    ) {
      this.bobSpeed = this.moveState.sprint ? 0.4 : 0.25;
    } else {
      this.bobSpeed = 0.07;
    }
    this.bobOffset += this.bobSpeed;
    this.bobAmount = Math.sin(this.bobOffset) * 0.05;

    const totalVerticalOffset = 1.5 + this.bobAmount + this.landingCameraOffset;
    const cameraOffset = new THREE.Vector3(0, totalVerticalOffset, -0.2);
    this.camera.position.copy(this.playerBody.position).add(cameraOffset);
  }

  private onMouseMove(event: MouseEvent): void {
    if (document.pointerLockElement === this.renderer.domElement) {
      const mouseX = -event.movementX * this.mouseSensitivity * 0.001;
      const mouseY = -event.movementY * this.mouseSensitivity * 0.001;

      this.currentRotationVelocity.x += mouseX * this.rotationAcceleration;
      this.currentRotationVelocity.y += mouseY * this.rotationAcceleration;

      this.currentRotationVelocity.x = THREE.MathUtils.clamp(
        this.currentRotationVelocity.x,
        -this.maxRotationVelocity,
        this.maxRotationVelocity
      );
      this.currentRotationVelocity.y = THREE.MathUtils.clamp(
        this.currentRotationVelocity.y,
        -this.maxRotationVelocity,
        this.maxRotationVelocity
      );
    }
  }

  private updateCameraRotation(): void {
    this.rotationY += this.currentRotationVelocity.x;
    this.rotationX += this.currentRotationVelocity.y;

    this.rotationX = THREE.MathUtils.clamp(
      this.rotationX,
      -Math.PI / 2 + 0.1,
      Math.PI / 2 - 0.1
    );

    this.currentRotationVelocity.multiplyScalar(this.rotationDamping);

    if (Math.abs(this.currentRotationVelocity.x) < 0.0001)
      this.currentRotationVelocity.x = 0;
    if (Math.abs(this.currentRotationVelocity.y) < 0.0001)
      this.currentRotationVelocity.y = 0;

    this.camera.quaternion.setFromEuler(
      new THREE.Euler(this.rotationX, this.rotationY, 0, "YXZ")
    );
  }

  public animate(): void {
    if (this.paused) {
      return;
    }

    const delta = this.clock.getDelta();

    const playerDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.quaternion
    );

    const playerPosition = new THREE.Vector3(
      this.playerBody.position.x,
      this.playerBody.position.y,
      this.playerBody.position.z
    );
    this.glassEnemies.update(playerPosition, playerDirection);

    this.updatePhysics();
    this.updateMovement();
    this.updateGroundPosition();
    this.updateScreenShake();
    this.updateSpeedEffect();
    this.updateVignetteEffect();
    this.updateSpeedLines();
    this.updateCameraRotation();

    this.updateGrapple();
    this.updateJumpEffects();
    this.platforms.checkCoinCollections(playerPosition);
    this.platforms.update(this.playerBody.position);

    this.uniforms["time"].value += 0.2 * delta * 5;

    this.updatePlayerAnimation();

    if (this.mixer) {
      this.mixer.update(delta);
    }

    this.renderer.clear();
    this.composer.render(0.01);

    this.animationId = requestAnimationFrame(() => this.animate());
  }

  public startAnimation(): void {
    if (!this.paused && this.animationId === null) {
      const animate = () => {
        this.animate();
      };
      this.animationId = requestAnimationFrame(animate);
    }
  }
}

new Game();
