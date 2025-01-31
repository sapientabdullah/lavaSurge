interface EnemyOptions {
  position: THREE.Vector3;
  size?: number;
  shape?: "sphere" | "cube";
  speed?: number;
  health?: number;
}

interface Coin {
  mesh: THREE.Object3D;
  body: CANNON.Body;
  collected: boolean;
  type: "coin" | "diamond" | "star";
}

interface MovementPattern {
  type: "horizontal" | "vertical" | "circular";
  speed: number;
  amplitude: number;
  startPosition: THREE.Vector3;
  startTime: number;
}

interface Platform {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  glassWall?: {
    mesh: THREE.Mesh;
    body: CANNON.Body;
    health: number;
  };
  movement?: MovementPattern;
  isTrap?: boolean;
  trapTimer?: number;
  crackingEffect?: THREE.Points;
}
