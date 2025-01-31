import * as THREE from "three";
import * as CANNON from "cannon-es";
import { fragmentShader, vertexShader } from "../shaders/enemyShader";

interface EnemyOptions {
  position: THREE.Vector3;
  size?: number;
  shape?: "sphere" | "cube";
  speed?: number;
  health?: number;
}

export class Enemy {
  private scene: THREE.Scene;
  private world: CANNON.World;
  private enemies: Array<{
    mesh: THREE.Mesh;
    body: CANNON.Body;
    health: number;
    speed: number;
  }> = [];
  private spawnInterval: number = 5000;
  private lastSpawnTime: number = 0;
  private maxEnemies: number = 0;
  private spawnDistance: number = 30; // distance in front of player to spawn
  private spawnArc: number = Math.PI / 3;

  constructor(scene: THREE.Scene, world: CANNON.World) {
    this.scene = scene;
    this.world = world;
  }

  public spawnEnemy(options: EnemyOptions) {
    const size = options.size || 1;
    const shape = options.shape || "sphere";
    const speed = options.speed || 15;
    const health = options.health || 100;

    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x88ccff,
      roughness: 0,
      metalness: 0,
      transmission: 0.9,
      thickness: 0.5,
      side: THREE.DoubleSide,
    });

    let mesh: THREE.Mesh;
    let physicsShape: CANNON.Shape;

    if (shape === "sphere") {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(size, 32, 32),
        glassMaterial
      );
      physicsShape = new CANNON.Sphere(size);
    } else {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        glassMaterial
      );
      physicsShape = new CANNON.Box(
        new CANNON.Vec3(size / 2, size / 2, size / 2)
      );
    }

    mesh.position.copy(options.position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const body = new CANNON.Body({
      mass: 1,
      shape: physicsShape,
      position: new CANNON.Vec3(
        options.position.x,
        options.position.y,
        options.position.z
      ),
    });

    this.scene.add(mesh);
    this.world.addBody(body);

    this.enemies.push({
      mesh,
      body,
      health,
      speed,
    });
  }

  public update(playerPosition: THREE.Vector3, playerDirection: THREE.Vector3) {
    const currentTime = Date.now();

    if (
      currentTime - this.lastSpawnTime > this.spawnInterval &&
      this.enemies.length < this.maxEnemies
    ) {
      const playerFacing = new THREE.Vector3(
        playerDirection.x,
        0,
        playerDirection.z
      ).normalize();

      const angleOffset = (Math.random() - 0.5) * this.spawnArc;
      const spawnDirection = playerFacing
        .clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), angleOffset);

      const spawnPosition = new THREE.Vector3(
        playerPosition.x + spawnDirection.x * this.spawnDistance,
        playerPosition.y + 5,
        playerPosition.z + spawnDirection.z * this.spawnDistance
      );

      this.spawnEnemy({
        position: spawnPosition,
        size: 0.8 + Math.random() * 0.4,
        shape: Math.random() > 0.5 ? "sphere" : "cube",
        speed: 12 + Math.random() * 6,
        health: 100,
      });

      this.lastSpawnTime = currentTime;
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      const direction = new THREE.Vector3()
        .copy(playerPosition)
        .sub(enemy.mesh.position)
        .normalize();

      enemy.body.velocity.set(
        direction.x * enemy.speed,
        direction.y * enemy.speed,
        direction.z * enemy.speed
      );

      enemy.mesh.position.copy(
        new THREE.Vector3(
          enemy.body.position.x,
          enemy.body.position.y,
          enemy.body.position.z
        )
      );
      enemy.mesh.quaternion.copy(
        new THREE.Quaternion(
          enemy.body.quaternion.x,
          enemy.body.quaternion.y,
          enemy.body.quaternion.z,
          enemy.body.quaternion.w
        )
      );

      if (enemy.mesh.position.distanceTo(playerPosition) > 50) {
        this.removeEnemy(i);
      }
    }
  }

  public damageEnemy(index: number, damage: number) {
    const enemy = this.enemies[index];
    enemy.health -= damage;

    const material = enemy.mesh.material as THREE.MeshPhysicalMaterial;
    material.opacity = (enemy.health / 100) * 0.3;
    material.transmission = (enemy.health / 100) * 0.9;

    if (enemy.health <= 0) {
      this.createBreakEffect(enemy.mesh.position);
      this.removeEnemy(index);
    }
  }

  public removeEnemy(index: number) {
    const enemy = this.enemies[index];
    this.scene.remove(enemy.mesh);
    this.world.removeBody(enemy.body);
    this.enemies.splice(index, 1);
  }

  private createBreakEffect(position: THREE.Vector3) {
    const enemy = this.enemies.find((e) => e.mesh.position.equals(position));
    if (!enemy) return;

    const enemyMaterial = enemy.mesh.material as THREE.MeshPhysicalMaterial;
    const enemyColor = enemyMaterial.color;

    const shardCount = 75; // shards
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(shardCount * 3);
    const velocities = new Float32Array(shardCount * 3);
    const rotations = new Float32Array(shardCount * 3);

    for (let i = 0; i < shardCount * 3; i += 3) {
      positions[i] = position.x + (Math.random() - 0.5) * 0.2;
      positions[i + 1] = position.y + (Math.random() - 0.5) * 0.2;
      positions[i + 2] = position.z + (Math.random() - 0.5) * 0.2;

      const theta = Math.random() * Math.PI * 2; // horizontal angle
      const phi = Math.random() * Math.PI; // vertical angle
      const speed = 3 + Math.random() * 4; // speed

      velocities[i] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i + 1] = Math.cos(phi) * speed;
      velocities[i + 2] = Math.sin(phi) * Math.sin(theta) * speed;

      rotations[i] = (Math.random() - 0.5) * 0.2;
      rotations[i + 1] = (Math.random() - 0.5) * 0.2;
      rotations[i + 2] = (Math.random() - 0.5) * 0.2;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const shardMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        opacity: { value: 1.0 },
        color: {
          value: new THREE.Vector3(enemyColor.r, enemyColor.g, enemyColor.b),
        },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const shards = new Array(shardCount);
    const shardGeometries = [
      new THREE.TetrahedronGeometry(0.05),
      new THREE.OctahedronGeometry(0.04),
      new THREE.IcosahedronGeometry(0.03),
    ];

    for (let i = 0; i < shardCount; i++) {
      const geometry =
        shardGeometries[Math.floor(Math.random() * shardGeometries.length)];
      shards[i] = new THREE.Mesh(geometry, shardMaterial);
      shards[i].position.set(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2]
      );
      this.scene.add(shards[i]);
    }

    const startTime = Date.now();
    const animate = () => {
      const elapsedTime = (Date.now() - startTime) / 1000;
      if (elapsedTime > 1.2) {
        shards.forEach((shard) => this.scene.remove(shard));
        return;
      }

      const gravity = -12;

      for (let i = 0; i < shardCount; i++) {
        const idx = i * 3;

        velocities[idx + 1] += gravity * 0.016;

        shards[i].position.x += velocities[idx] * 0.016;
        shards[i].position.y += velocities[idx + 1] * 0.016;
        shards[i].position.z += velocities[idx + 2] * 0.016;

        shards[i].rotation.x += rotations[idx];
        shards[i].rotation.y += rotations[idx + 1];
        shards[i].rotation.z += rotations[idx + 2];

        rotations[idx] *= 0.98;
        rotations[idx + 1] *= 0.98;
        rotations[idx + 2] *= 0.98;
      }

      shardMaterial.uniforms.time.value = elapsedTime;
      shardMaterial.uniforms.opacity.value = 1.0 - elapsedTime / 1.2;

      requestAnimationFrame(animate);
    };
    animate();
  }

  public checkPlayerCollisions(playerBody: CANNON.Body): boolean {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      const distance = new THREE.Vector3(
        enemy.body.position.x - playerBody.position.x,
        enemy.body.position.y - playerBody.position.y,
        enemy.body.position.z - playerBody.position.z
      ).length();

      if (distance < 2) {
        this.removeEnemy(i);
        return true;
      }
    }
    return false;
  }

  public getEnemies() {
    return this.enemies;
  }
}
