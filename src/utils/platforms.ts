import * as THREE from "three";
import * as CANNON from "cannon-es";
import { generateColor } from "./generateColor";

export class Platforms {
  private platforms: Platform[] = [];
  private coins: Coin[] = [];
  private score: number = 0;
  private scoreElement: HTMLDivElement;
  private platformHealth: Map<CANNON.Body, number> = new Map();
  private lastPlatformZ: number = 0;
  private platformGenerationDistance: number = 20;
  private platformRemovalDistance: number = 30;
  private scene: THREE.Scene;
  private world: CANNON.World;
  private bumpTexture: THREE.Texture;

  private readonly TRAP_BREAK_DELAY = 1000;
  private activatedTraps: Set<Platform> = new Set();

  constructor(scene: THREE.Scene, world: CANNON.World) {
    this.scene = scene;
    this.world = world;
    this.scoreElement = document.querySelector(".score-display")!;

    const textureSize = 256;
    const data = new Uint8Array(textureSize * textureSize);
    for (let i = 0; i < data.length; i++) {
      const x = i % textureSize;
      const y = Math.floor(i / textureSize);
      const noise =
        Math.sin(x * 0.1) *
        Math.cos(y * 0.1) *
        Math.sin((x + y) * 0.05) *
        (Math.random() * 0.3 + 0.7);
      data[i] = (noise + 1) * 127.5;
    }

    this.bumpTexture = new THREE.DataTexture(
      data,
      textureSize,
      textureSize,
      THREE.LuminanceFormat
    );
    this.bumpTexture.wrapS = THREE.RepeatWrapping;
    this.bumpTexture.wrapT = THREE.RepeatWrapping;
    this.bumpTexture.needsUpdate = true;
  }

  private createPlatformMaterial(color: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: color,
      transparent: true,
      opacity: 1,
      bumpMap: this.bumpTexture,
      bumpScale: 0.1,
      roughness: 0.7,
      metalness: 0.2,
    });
  }

  public getScore(): number {
    return this.score;
  }

  public resetScore(): void {
    this.score = 0;
    this.updateScoreDisplay();
  }

  private updateScoreDisplay(): void {
    const scoreValueElement = this.scoreElement.querySelector(".score-value")!;
    scoreValueElement.textContent = this.score.toString();
  }

  private createTrapPlatform(
    pos: { x: number; y: number; z: number },
    size: number,
    length: number
  ): void {
    const platformGeo = new THREE.BoxGeometry(size, 0.5, length);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.8,
    });
    const platformMesh = new THREE.Mesh(platformGeo, platformMat);
    const platformShape = new CANNON.Box(
      new CANNON.Vec3(size / 2, 0.25, length / 2)
    );

    platformMesh.position.set(pos.x, pos.y, pos.z);
    platformMesh.castShadow = true;
    platformMesh.receiveShadow = true;
    this.scene.add(platformMesh);

    const platformBody = new CANNON.Body({
      mass: 0,
      shape: platformShape,
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
    });
    this.world.addBody(platformBody);

    const platform: Platform = {
      mesh: platformMesh,
      body: platformBody,
      isTrap: true,
      trapTimer: 0,
    };

    this.platforms.push(platform);
    this.platformHealth.set(platformBody, 100);
  }

  private createCrackingEffect(platform: Platform): void {
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = platform.mesh.position.x + (Math.random() - 0.5) * 2;
      positions[i + 1] = platform.mesh.position.y;
      positions[i + 2] = platform.mesh.position.z + (Math.random() - 0.5) * 2;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x333333,
      size: 0.1,
      transparent: true,
      opacity: 0.8,
    });

    const particles = new THREE.Points(geometry, material);
    platform.crackingEffect = particles;
    this.scene.add(particles);
  }

  private updateTrapPlatforms(): void {
    this.activatedTraps.forEach((platform) => {
      if (!platform.trapTimer) return;

      const elapsedTime = Date.now() - platform.trapTimer;
      const breakProgress = elapsedTime / this.TRAP_BREAK_DELAY;

      if (platform.mesh.material instanceof THREE.MeshStandardMaterial) {
        platform.mesh.material.opacity = 1 - breakProgress;
      }

      if (platform.crackingEffect) {
        platform.crackingEffect.rotation.y += 0.01;
        const positions = platform.crackingEffect.geometry.attributes.position
          .array as Float32Array;
        for (let i = 0; i < positions.length; i += 3) {
          positions[i] += (Math.random() - 0.5) * 0.02;
          positions[i + 2] += (Math.random() - 0.5) * 0.02;
        }
        platform.crackingEffect.geometry.attributes.position.needsUpdate = true;
      }

      if (elapsedTime >= this.TRAP_BREAK_DELAY) {
        this.removePlatform(platform);
        this.activatedTraps.delete(platform);
      }
    });
  }

  public activateTrapPlatform(platform: Platform): void {
    if (platform.isTrap && !platform.trapTimer) {
      platform.trapTimer = Date.now();
      this.activatedTraps.add(platform);
      this.createCrackingEffect(platform);
    }
  }

  private createCoin(
    position: THREE.Vector3,
    type: Coin["type"] = "coin"
  ): void {
    let geometry: THREE.BufferGeometry;
    let shape: CANNON.Shape;

    switch (type) {
      case "coin":
        geometry = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 32);
        shape = new CANNON.Cylinder(0.3, 0.3, 0.05, 32);
        break;
      case "diamond":
        geometry = new THREE.ConeGeometry(0.25, 0.5, 4);
        shape = new CANNON.Cylinder(0, 0.25, 0.5, 4);
        break;
      case "star":
        const starShape = new THREE.Shape();
        const outerRadius = 0.25;
        const innerRadius = 0.1;
        const spikes = 5;
        for (let i = 0; i < spikes; i++) {
          const rot = (Math.PI * 2 * i) / spikes;
          const x = outerRadius * Math.cos(rot);
          const y = outerRadius * Math.sin(rot);
          if (i === 0) {
            starShape.moveTo(x, y);
          } else {
            starShape.lineTo(x, y);
          }
          const rot2 = rot + Math.PI / spikes;
          const x2 = innerRadius * Math.cos(rot2);
          const y2 = innerRadius * Math.sin(rot2);
          starShape.lineTo(x2, y2);
        }
        geometry = new THREE.ShapeGeometry(starShape);

        shape = new CANNON.Box(new CANNON.Vec3(0.25, 0.25, 0.05));
        break;
      default:
        throw new Error(`Unsupported collectible type: ${type}`);
    }

    const material = new THREE.MeshStandardMaterial({
      color: type === "diamond" ? 0x99ccff : 0xffd700,
      metalness: 1,
      roughness: 0.3,
      emissive: type === "diamond" ? 0x4488ff : 0xaa8800,
      emissiveIntensity: 0.3,
    });

    const mesh = new THREE.Mesh(geometry, material);

    const container = new THREE.Object3D();
    container.position.copy(position);
    container.add(mesh);

    if (type === "coin") {
      mesh.rotation.x = Math.PI / 2;
    } else if (type === "diamond") {
      container.rotation.x = Math.PI / 2;
      container.rotation.z = Math.PI / 4;
    }

    this.scene.add(container);

    const body = new CANNON.Body({
      mass: 0,
      shape: shape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      collisionResponse: false,
    });

    if (type === "coin" || type === "diamond") {
      body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
    }

    this.world.addBody(body);

    this.coins.push({
      mesh: container,
      body: body,
      collected: false,
      type: type,
    });
  }

  private createCylinderPlatform(
    pos: { x: number; y: number; z: number },
    size: number,
    isMoving: boolean = false
  ): void {
    const radius = size / 2;
    const height = 0.5;
    const platformGeo = new THREE.CylinderGeometry(radius, radius, height, 32);
    const platformMat = new THREE.MeshStandardMaterial({
      color: generateColor(),
      transparent: true,
      opacity: 1,
    });
    const platformMesh = new THREE.Mesh(platformGeo, platformMat);

    platformMesh.position.set(pos.x, pos.y, pos.z);
    platformMesh.castShadow = true;
    platformMesh.receiveShadow = true;
    this.scene.add(platformMesh);

    const platformShape = new CANNON.Cylinder(radius, radius, height, 32);
    const platformBody = new CANNON.Body({
      mass: 0,
      shape: platformShape,
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
    });
    this.world.addBody(platformBody);

    this.platformHealth.set(platformBody, 100);
    const newPlatform: Platform = {
      mesh: platformMesh,
      body: platformBody,
    };

    if (isMoving) {
      newPlatform.movement = this.createMovementPattern(
        new THREE.Vector3(pos.x, pos.y, pos.z)
      );
    }

    this.platforms.push(newPlatform);
  }

  private createCoinCollectionEffect(position: THREE.Vector3): void {
    const particleCount = 10;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = position.x + (Math.random() - 0.5) * 0.5;
      positions[i + 1] = position.y + (Math.random() - 0.5) * 0.5;
      positions[i + 2] = position.z + (Math.random() - 0.5) * 0.5;

      colors[i] = 1; // r
      colors[i + 1] = 0.84; // g
      colors[i + 2] = 0; // g
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 1,
    });

    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);

    const startTime = Date.now();
    const animate = () => {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > 500) {
        this.scene.remove(particles);
        return;
      }

      const positions = geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += (Math.random() - 0.5) * 0.05;
        positions[i + 1] += 0.05;
        positions[i + 2] += (Math.random() - 0.5) * 0.05;
      }
      geometry.attributes.position.needsUpdate = true;

      material.opacity = 1 - elapsedTime / 500;

      requestAnimationFrame(animate);
    };
    animate();
  }

  public checkCoinCollections(playerPosition: THREE.Vector3): void {
    const collectionRadius = 1.5;

    this.coins.forEach((coin) => {
      if (!coin.collected) {
        const distance = new THREE.Vector3(
          playerPosition.x - coin.body.position.x,
          playerPosition.y - coin.body.position.y,
          playerPosition.z - coin.body.position.z
        ).length();

        if (distance < collectionRadius) {
          this.collectCoin(coin);
        }
      }
    });
  }

  private collectCoin(coin: Coin): void {
    coin.collected = true;
    this.score++;
    this.updateScoreDisplay();

    this.createCoinCollectionEffect(coin.mesh.position);

    const startPosition = coin.mesh.position.clone();
    const startScale = coin.mesh.scale.clone();
    const startTime = Date.now();
    const duration = 500;

    const animateCoinCollection = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      coin.mesh.scale.copy(startScale.multiplyScalar(1 - progress));
      coin.mesh.position.copy(
        startPosition.clone().add(new THREE.Vector3(0, progress * 2, 0))
      );

      if (progress < 1) {
        requestAnimationFrame(animateCoinCollection);
      } else {
        this.scene.remove(coin.mesh);
        this.world.removeBody(coin.body);
      }
    };

    animateCoinCollection();
  }

  public updateCoins(): void {
    this.coins.forEach((coin) => {
      if (!coin.collected) {
        coin.mesh.rotation.y += 0.02;
      }
    });
  }

  public initializePlatforms(): void {
    const initialPlatformPositions = [
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 1, z: -4 },
      { x: -4, y: 2, z: -8 },
      { x: 2, y: 3, z: -12 },
      { x: -2, y: 4, z: -16 },
      { x: 5, y: 2, z: -20 },
      { x: -6, y: 3, z: -24 },
      { x: 0, y: 4, z: -28 },
    ];

    initialPlatformPositions.forEach((pos) => {
      this.createPlatform(pos);
      if (Math.random() < 0.4) {
        const collectibleType: Coin["type"] =
          Math.random() < 0.5
            ? "coin"
            : Math.random() < 0.7
            ? "diamond"
            : "star";
        this.createCoin(
          new THREE.Vector3(pos.x, pos.y + 1.5, pos.z),
          collectibleType
        );
      }
    });
  }

  public updatePlatforms(playerPos: CANNON.Vec3): void {
    const platformSpacing = 4;

    while (this.lastPlatformZ > playerPos.z - this.platformGenerationDistance) {
      const platformsInRow = Math.floor(Math.random() * 2) + 2;

      const coinPlatformIndex = Math.floor(Math.random() * platformsInRow);

      for (let i = 0; i < platformsInRow; i++) {
        const platformPosition = {
          x: (Math.random() - 0.5) * 8,
          y: 2 + Math.random() * 2,
          z: this.lastPlatformZ - platformSpacing,
        };

        this.createPlatform(platformPosition);

        if (i === coinPlatformIndex && Math.random() < 0.4) {
          this.createCoin(
            new THREE.Vector3(
              platformPosition.x,
              platformPosition.y + 1.5,
              platformPosition.z
            )
          );
        }
      }

      this.lastPlatformZ -= platformSpacing;
    }

    const removeDistance = this.platformRemovalDistance;

    this.platforms = this.platforms.filter((platform) => {
      const distance = playerPos.z - platform.mesh.position.z;
      if (distance > removeDistance) {
        this.scene.remove(platform.mesh);
        this.world.removeBody(platform.body);
        this.platformHealth.delete(platform.body);
        if (platform.glassWall) {
          this.scene.remove(platform.glassWall.mesh);
          this.world.removeBody(platform.glassWall.body);
        }
        return false;
      }
      return true;
    });

    this.coins = this.coins.filter((coin) => {
      if (
        coin.collected ||
        playerPos.z - coin.body.position.z > removeDistance
      ) {
        if (!coin.collected) {
          this.scene.remove(coin.mesh);
          this.world.removeBody(coin.body);
        }
        return false;
      }
      return true;
    });
  }

  private checkPlatformOverlap(
    newPos: { x: number; y: number; z: number },
    size: number,
    length: number
  ): boolean {
    const buffer = 1;

    for (const platform of this.platforms) {
      const existingPos = platform.mesh.position;
      const geometry = platform.mesh.geometry;
      let existingSize: number;
      let existingLength: number;

      if (geometry instanceof THREE.BoxGeometry) {
        existingSize = geometry.parameters.width;
        existingLength = geometry.parameters.depth;
      } else if (geometry instanceof THREE.ConeGeometry) {
        existingSize = geometry.parameters.radius * 2;
        existingLength = existingSize;
      } else if (geometry instanceof THREE.CylinderGeometry) {
        existingSize = geometry.parameters.radiusTop * 2;
        existingLength = existingSize;
      } else {
        continue;
      }

      const newMinX = newPos.x - size / 2 - buffer;
      const newMaxX = newPos.x + size / 2 + buffer;
      const newMinZ = newPos.z - length / 2 - buffer;
      const newMaxZ = newPos.z + length / 2 + buffer;

      const existingMinX = existingPos.x - existingSize / 2 - buffer;
      const existingMaxX = existingPos.x + existingSize / 2 + buffer;
      const existingMinZ = existingPos.z - existingLength / 2 - buffer;
      const existingMaxZ = existingPos.z + existingLength / 2 + buffer;

      if (
        !(
          newMaxX < existingMinX ||
          newMinX > existingMaxX ||
          newMaxZ < existingMinZ ||
          newMinZ > existingMaxZ
        )
      ) {
        return true;
      }
    }
    return false;
  }

  private createPlatform(pos: { x: number; y: number; z: number }): void {
    const platformSize = Math.random() * 2 + 2;
    const platformLength = 8;
    let attempts = 0;
    const maxAttempts = 10;
    let finalPos = { ...pos };

    while (
      attempts < maxAttempts &&
      this.checkPlatformOverlap(finalPos, platformSize, platformLength)
    ) {
      finalPos = {
        x: pos.x + (Math.random() - 0.5) * 4,
        y: pos.y,
        z: pos.z,
      };
      attempts++;
    }

    if (attempts === maxAttempts) {
      return;
    }

    const isMoving = Math.random() < 0.3; // 30% chance for moving platforms
    const isTrap = Math.random() < 0.2; // 20% chance for trap platforms

    if (isTrap) {
      this.createTrapPlatform(finalPos, platformSize, platformLength);
    } else {
      const platformType = Math.random();
      if (platformType < 0.33) {
        this.createBoxPlatform(
          finalPos,
          platformSize,
          platformLength,
          isMoving
        );
      } else if (platformType < 0.66) {
        this.createConePlatform(finalPos, platformSize, isMoving);
      } else {
        this.createCylinderPlatform(finalPos, platformSize, isMoving);
      }
    }
  }

  private createMovementPattern(startPos: THREE.Vector3): MovementPattern {
    const patterns: ("horizontal" | "vertical" | "circular")[] = [
      "horizontal",
      "vertical",
      "circular",
    ];
    const type = patterns[Math.floor(Math.random() * patterns.length)];

    return {
      type,
      speed: 0.5 + Math.random() * 1.5, // speed
      amplitude: 2 + Math.random() * 3, // amplitude
      startPosition: startPos.clone(),
      startTime: Date.now(),
    };
  }

  private createBoxPlatform(
    pos: { x: number; y: number; z: number },
    size: number,
    length: number,
    isMoving: boolean = false
  ): void {
    const platformGeo = new THREE.BoxGeometry(
      size, // width
      0.5, // height
      length, // depth
      32, // width segments
      8, // height segments
      32 // depth segments
    );
    const platformMat = this.createPlatformMaterial(generateColor());
    const platformMesh = new THREE.Mesh(platformGeo, platformMat);

    const positions = platformGeo.attributes.position.array;
    const normals = platformGeo.attributes.normal.array;

    const isFaceVertex = (
      normal: THREE.Vector3,
      targetNormal: THREE.Vector3
    ) => {
      return Math.abs(normal.dot(targetNormal)) > 0.9;
    };

    for (let i = 0; i < positions.length; i += 3) {
      const vertexNormal = new THREE.Vector3(
        normals[i],
        normals[i + 1],
        normals[i + 2]
      );

      const posX = new THREE.Vector3(1, 0, 0); // right face
      const negX = new THREE.Vector3(-1, 0, 0); // left face
      const posY = new THREE.Vector3(0, 1, 0); // top face
      const negY = new THREE.Vector3(0, -1, 0); // bottom face
      const posZ = new THREE.Vector3(0, 0, 1); // front face
      const negZ = new THREE.Vector3(0, 0, -1); // back face

      let displacement = (Math.random() - 0.5) * 0.1;

      if (
        isFaceVertex(vertexNormal, posX) ||
        isFaceVertex(vertexNormal, negX)
      ) {
        positions[i] += vertexNormal.x * displacement;
      }
      if (
        isFaceVertex(vertexNormal, posY) ||
        isFaceVertex(vertexNormal, negY)
      ) {
        positions[i + 1] += vertexNormal.y * displacement;
      }
      if (
        isFaceVertex(vertexNormal, posZ) ||
        isFaceVertex(vertexNormal, negZ)
      ) {
        positions[i + 2] += vertexNormal.z * displacement;
      }
    }

    platformGeo.attributes.position.needsUpdate = true;
    platformGeo.computeVertexNormals();

    platformMesh.position.set(pos.x, pos.y, pos.z);
    platformMesh.castShadow = true;
    platformMesh.receiveShadow = true;
    this.scene.add(platformMesh);

    const platformShape = new CANNON.Box(
      new CANNON.Vec3(size / 2, 0.25, length / 2)
    );
    const platformBody = new CANNON.Body({
      mass: 0,
      shape: platformShape,
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
    });
    this.world.addBody(platformBody);

    const wallHeight = 3;
    const wallGeometry = new THREE.BoxGeometry(
      size,
      wallHeight,
      0.1,
      32,
      16,
      4
    );
    const wallMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x88ccff,
      roughness: 0,
      metalness: 0,
      transmission: 0.9,
      thickness: 0.5,
    });

    const wallPositions = wallGeometry.attributes.position.array;
    const wallNormals = wallGeometry.attributes.normal.array;

    for (let i = 0; i < wallPositions.length; i += 3) {
      const vertexNormal = new THREE.Vector3(
        wallNormals[i],
        wallNormals[i + 1],
        wallNormals[i + 2]
      );

      const displacement = (Math.random() - 0.5) * 0.05;
      wallPositions[i] += vertexNormal.x * displacement;
      wallPositions[i + 1] += vertexNormal.y * displacement;
      wallPositions[i + 2] += vertexNormal.z * displacement;
    }

    wallGeometry.attributes.position.needsUpdate = true;
    wallGeometry.computeVertexNormals();

    const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
    wallMesh.position.set(pos.x, pos.y + wallHeight / 2, pos.z);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    this.scene.add(wallMesh);

    const wallShape = new CANNON.Box(
      new CANNON.Vec3(size / 2, wallHeight / 2, 0.05)
    );
    const wallBody = new CANNON.Body({
      mass: 0,
      shape: wallShape,
      position: new CANNON.Vec3(
        pos.x,
        pos.y + wallHeight / 2,
        pos.z - length / 4
      ),
    });
    this.world.addBody(wallBody);

    const platform: Platform = {
      mesh: platformMesh,
      body: platformBody,
      glassWall: {
        mesh: wallMesh,
        body: wallBody,
        health: 100,
      },
    };

    if (isMoving) {
      platform.movement = this.createMovementPattern(
        new THREE.Vector3(pos.x, pos.y, pos.z)
      );
    }

    this.platforms.push(platform);
    this.platformHealth.set(platformBody, 100);
  }

  private createConePlatform(
    pos: { x: number; y: number; z: number },
    size: number,
    isMoving: boolean = false
  ): void {
    const platformGeo = new THREE.ConeGeometry(size / 2, 1, 4);
    const platformMat = new THREE.MeshStandardMaterial({
      color: generateColor(),
      transparent: true,
      opacity: 1,
    });
    const platformMesh = new THREE.Mesh(platformGeo, platformMat);
    const platformShape = new CANNON.Cylinder(size / 2, size / 2, 1, 4);

    platformMesh.rotation.y = Math.PI / 4;
    platformMesh.position.set(pos.x, pos.y, pos.z);
    platformMesh.castShadow = true;
    platformMesh.receiveShadow = true;
    this.scene.add(platformMesh);

    const platformBody = new CANNON.Body({
      mass: 0,
      shape: platformShape,
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
    });
    this.world.addBody(platformBody);

    this.platformHealth.set(platformBody, 100);
    this.platforms.push({ mesh: platformMesh, body: platformBody });

    if (isMoving) {
      const startPos = new THREE.Vector3(pos.x, pos.y, pos.z);
      const movement = this.createMovementPattern(startPos);
      this.platforms.push({
        mesh: platformMesh,
        body: platformBody,
        movement,
      });
    } else {
      this.platforms.push({ mesh: platformMesh, body: platformBody });
    }
  }

  private updatePlatformPosition(platform: Platform): void {
    if (!platform.movement) return;

    const currentTime = Date.now();
    const elapsed = (currentTime - platform.movement.startTime) / 1000;
    const { type, speed, amplitude, startPosition } = platform.movement;

    let newPosition = new THREE.Vector3();

    switch (type) {
      case "horizontal":
        newPosition.set(
          startPosition.x + Math.sin(elapsed * speed) * amplitude,
          startPosition.y,
          startPosition.z
        );
        break;
      case "vertical":
        newPosition.set(
          startPosition.x,
          startPosition.y + Math.sin(elapsed * speed) * amplitude,
          startPosition.z
        );
        break;
      case "circular":
        newPosition.set(
          startPosition.x + Math.cos(elapsed * speed) * amplitude,
          startPosition.y + Math.sin(elapsed * speed) * amplitude,
          startPosition.z
        );
        break;
    }

    platform.mesh.position.copy(newPosition);
    platform.body.position.copy(
      new CANNON.Vec3(newPosition.x, newPosition.y, newPosition.z)
    );

    if (platform.glassWall) {
      const wallHeight = (platform.glassWall.mesh.geometry as THREE.BoxGeometry)
        .parameters.height;

      const wallPosition = new THREE.Vector3(
        newPosition.x,
        newPosition.y + wallHeight / 2,
        newPosition.z
      );

      platform.glassWall.mesh.position.copy(wallPosition);
      platform.glassWall.body.position.copy(
        new CANNON.Vec3(wallPosition.x, wallPosition.y, wallPosition.z)
      );
    }
  }

  public update(playerPos: CANNON.Vec3): void {
    this.platforms.forEach((platform) => {
      this.updatePlatformPosition(platform);
    });

    this.updatePlatforms(playerPos);
    this.updateCoins();

    this.updateTrapPlatforms();

    this.platforms.forEach((platform) => {
      if (platform.isTrap && !platform.trapTimer) {
        const distance = new THREE.Vector3(
          playerPos.x - platform.body.position.x,
          playerPos.y - platform.body.position.y,
          playerPos.z - platform.body.position.z
        ).length();

        if (distance < 2) {
          this.activateTrapPlatform(platform);
        }
      }
    });
  }

  public getPlatforms(): Platform[] {
    return this.platforms;
  }

  public getPlatformHealth(body: CANNON.Body): number {
    return this.platformHealth.get(body) ?? 100;
  }

  public setPlatformHealth(body: CANNON.Body, health: number): void {
    this.platformHealth.set(body, health);
  }

  private createPlatformChunk(
    position: THREE.Vector3,
    size: THREE.Vector3,
    color: number
  ): {
    mesh: THREE.Mesh;
    body: CANNON.Body;
  } {
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    this.scene.add(mesh);

    const shape = new CANNON.Box(
      new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)
    );
    const body = new CANNON.Body({
      mass: 1,
      shape: shape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      material: new CANNON.Material({ friction: 0.3, restitution: 0.2 }),
    });

    const force = 2;
    body.velocity.set(
      (Math.random() - 0.5) * force,
      Math.random() * force,
      (Math.random() - 0.5) * force
    );
    body.angularVelocity.set(
      (Math.random() - 0.5) * force,
      (Math.random() - 0.5) * force,
      (Math.random() - 0.5) * force
    );

    this.world.addBody(body);

    return { mesh, body };
  }

  private createCrumblingEffect(platform: Platform): void {
    const originalColor = (
      platform.mesh.material as THREE.MeshStandardMaterial
    ).color.getHex();
    const chunks: { mesh: THREE.Mesh; body: CANNON.Body; startTime: number }[] =
      [];
    const chunkCount = 8; // pieces per dimension

    const platformSize = new THREE.Vector3();
    (platform.mesh.geometry as THREE.BoxGeometry).computeBoundingBox();
    platform.mesh.geometry.boundingBox?.getSize(platformSize);

    const chunkSize = new THREE.Vector3(
      platformSize.x / chunkCount,
      platformSize.y,
      platformSize.z / chunkCount
    );

    // grid of chunks
    for (let x = 0; x < chunkCount; x++) {
      for (let z = 0; z < chunkCount; z++) {
        const position = new THREE.Vector3(
          platform.mesh.position.x -
            platformSize.x / 2 +
            chunkSize.x * (x + 0.5),
          platform.mesh.position.y,
          platform.mesh.position.z -
            platformSize.z / 2 +
            chunkSize.z * (z + 0.5)
        );

        const chunk = this.createPlatformChunk(
          position,
          chunkSize,
          originalColor
        );
        chunks.push({ ...chunk, startTime: Date.now() });
      }
    }

    const duration = 2000;
    const animate = () => {
      const currentTime = Date.now();
      chunks.forEach((chunk, index) => {
        const elapsed = currentTime - chunk.startTime;
        const progress = elapsed / duration;

        chunk.mesh.position.copy(
          chunk.body.position as unknown as THREE.Vector3
        );
        chunk.mesh.quaternion.copy(
          chunk.body.quaternion as unknown as THREE.Quaternion
        );

        if (chunk.mesh.material instanceof THREE.MeshStandardMaterial) {
          chunk.mesh.material.opacity = Math.max(0, 1 - progress);
        }

        if (progress >= 1) {
          this.scene.remove(chunk.mesh);
          this.world.removeBody(chunk.body);
          chunks.splice(index, 1);
        }
      });

      if (chunks.length > 0) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  public removePlatform(platform: Platform): void {
    if (platform.crackingEffect) {
      this.scene.remove(platform.crackingEffect);
    }

    if (platform.mesh.geometry instanceof THREE.BoxGeometry) {
      this.createCrumblingEffect(platform);
    }

    this.scene.remove(platform.mesh);
    this.world.removeBody(platform.body);
    if (platform.glassWall) {
      this.scene.remove(platform.glassWall.mesh);
      this.world.removeBody(platform.glassWall.body);
    }

    const index = this.platforms.indexOf(platform);
    if (index > -1) {
      this.platforms.splice(index, 1);
    }
    this.platformHealth.delete(platform.body);
  }
}
