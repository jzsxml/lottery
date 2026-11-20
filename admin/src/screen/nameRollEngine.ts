import * as THREE from "three";
import type { SphereRollModeId } from "./sphereRollModesMeta";
import type { ScreenPhase, ScreenPoolPerson, ScreenWinner } from "./types";

const SPHERE_RADIUS = 4.2;
const MAX_CARDS = 200;
const CARD_W = 1.1;
const CARD_H = 0.55;

export function makeLabelTexture(name: string, dept: string, accent: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(15, 22, 40, 0.92)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(name, canvas.width / 2, 52);
  ctx.fillStyle = "#9bb4d9";
  ctx.font = "22px 'Segoe UI', sans-serif";
  ctx.fillText(dept || "—", canvas.width / 2, 92);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function fibonacciSphere(n: number, radius: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const offset = 2 / n;
  const increment = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = i * offset - 1 + offset / 2;
    const r = Math.sqrt(1 - y * y);
    const phi = i * increment;
    pts.push(
      new THREE.Vector3(Math.cos(phi) * r * radius, y * radius, Math.sin(phi) * r * radius)
    );
  }
  return pts;
}

type CardMotion = {
  participantId: number;
  vel: THREE.Vector3;
  fallSpeed: number;
  column: number;
  spawnY: number;
  home?: THREE.Vector3;
  burstCooldown: number;
};

function makeCardMesh(tex: THREE.CanvasTexture, id: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 1 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), mat);
  mesh.userData.participantId = id;
  return mesh;
}

function phaseSpeedMult(phase: ScreenPhase): number {
  if (phase === "rolling") return 1;
  if (phase === "slowing") return 0.35;
  if (phase === "result") return 0.05;
  return 0.4;
}

function respawnFountain(mesh: THREE.Mesh, motion: CardMotion, intensity: number) {
  mesh.position.set((Math.random() - 0.5) * 2.5, -5.8, (Math.random() - 0.5) * 2.5);
  motion.vel.set(
    (Math.random() - 0.5) * 3.5 * intensity,
    7 + Math.random() * 9 * intensity,
    (Math.random() - 0.5) * 3.5 * intensity
  );
}

function respawnVolcano(mesh: THREE.Mesh, motion: CardMotion, intensity: number) {
  mesh.position.set((Math.random() - 0.5) * 0.4, -6, (Math.random() - 0.5) * 0.4);
  const dir = new THREE.Vector3(
    (Math.random() - 0.5) * 2,
    1.2 + Math.random() * 1.5,
    (Math.random() - 0.5) * 2
  ).normalize();
  const speed = (6 + Math.random() * 10) * intensity;
  motion.vel.copy(dir.multiplyScalar(speed));
}

export type NameRollSystem = {
  cards: THREE.Group;
  usesRootSpin: boolean;
  update: (args: {
    dt: number;
    elapsed: number;
    phase: ScreenPhase;
    root: THREE.Group;
    omega: number;
    camera: THREE.Camera;
    winners: ScreenWinner[];
  }) => void;
};

export function createNameRollSystem(
  mode: SphereRollModeId,
  people: ScreenPoolPerson[],
  accent: string
): NameRollSystem {
  const slice = people.slice(0, MAX_CARDS);
  const n = Math.max(slice.length, 1);
  const cards = new THREE.Group();

  if (mode === "globe") {
    const positions = fibonacciSphere(n, SPHERE_RADIUS);
    slice.forEach((person, i) => {
      const tex = makeLabelTexture(person.name, person.department, accent);
      const mesh = makeCardMesh(tex, person.id);
      mesh.position.copy(positions[i]!);
      mesh.lookAt(0, 0, 0);
      cards.add(mesh);
    });
    return {
      cards,
      usesRootSpin: true,
      update: ({ dt, phase, root, omega, camera, winners }) => {
        root.rotation.y += omega * dt;
        applyWinnerFocus(cards, phase, winners, camera, true);
      },
    };
  }

  const cols = Math.min(14, Math.max(4, Math.ceil(Math.sqrt(n))));
  slice.forEach((person, i) => {
    const tex = makeLabelTexture(person.name, person.department, accent);
    const mesh = makeCardMesh(tex, person.id);
    const motion: CardMotion = {
      participantId: person.id,
      vel: new THREE.Vector3(),
      fallSpeed: 2.5 + Math.random() * 3.5,
      column: i % cols,
      spawnY: 6 + Math.random() * 4,
      burstCooldown: Math.random() * 2,
    };
    mesh.userData.motion = motion;

    if (mode === "shuffle") {
      mesh.position.set(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 10
      );
      motion.vel.set(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 4
      );
    } else if (mode === "waterfall") {
      const x = (motion.column - cols / 2) * 1.35 + (Math.random() - 0.5) * 0.35;
      const z = ((i % 3) - 1) * 1.8 + (Math.random() - 0.5) * 0.5;
      mesh.position.set(x, motion.spawnY - (i % 10) * 0.9, z);
    } else if (mode === "fountain") {
      respawnFountain(mesh, motion, 0.6);
    } else if (mode === "volcano") {
      respawnVolcano(mesh, motion, 0.7);
    }

    cards.add(mesh);
  });

  return {
    cards,
    usesRootSpin: false,
    update: ({ dt, phase, root, camera, winners, elapsed }) => {
      const mult = phaseSpeedMult(phase);
      const rolling = phase === "rolling";
      const slowing = phase === "slowing";
      const result = phase === "result";
      root.rotation.y = Math.sin(elapsed * 0.12) * 0.08;

      for (const child of cards.children) {
        if (!(child instanceof THREE.Mesh)) continue;
        const motion = child.userData.motion as CardMotion | undefined;
        if (!motion) continue;
        const id = child.userData.participantId as number;
        if (result && winners.length > 0 && winners[0]!.participantId === id) continue;

        if (mode === "shuffle") {
          if (rolling) {
            motion.vel.x += (Math.random() - 0.5) * 8 * dt;
            motion.vel.y += (Math.random() - 0.5) * 6 * dt;
            motion.vel.z += (Math.random() - 0.5) * 8 * dt;
          }
          motion.vel.clampLength(0, rolling ? 11 : slowing ? 3 : 5);
          child.position.addScaledVector(motion.vel, dt * mult * 1.2);
          for (const axis of ["x", "y", "z"] as const) {
            const v = child.position[axis];
            const lim = axis === "y" ? 5 : 7;
            if (v > lim || v < -lim) {
              motion.vel[axis] *= -0.92;
              child.position[axis] = THREE.MathUtils.clamp(v, -lim, lim);
            }
          }
          child.lookAt(camera.position);
        } else if (mode === "waterfall") {
          const speed = motion.fallSpeed * mult * (rolling ? 2.2 : slowing ? 0.7 : 1);
          child.position.y -= speed * dt;
          child.position.x =
            (motion.column - cols / 2) * 1.35 +
            Math.sin(elapsed * 1.3 + motion.column) * 0.12;
          if (child.position.y < -6) {
            child.position.y = motion.spawnY + Math.random() * 3;
          }
          child.lookAt(camera.position);
        } else if (mode === "fountain") {
          motion.vel.y -= 11 * dt;
          child.position.addScaledVector(motion.vel, dt * mult);
          if (child.position.y < -6.5 || child.position.length() > 18) {
            respawnFountain(child, motion, rolling ? 1.15 : slowing ? 0.45 : 0.55);
          }
          child.lookAt(camera.position);
        } else if (mode === "volcano") {
          motion.burstCooldown -= dt;
          motion.vel.y -= 9 * dt;
          motion.vel.multiplyScalar(1 - 0.35 * dt);
          child.position.addScaledVector(motion.vel, dt * mult);
          if (motion.burstCooldown <= 0 && rolling) {
            motion.burstCooldown = 0.15 + Math.random() * 0.25;
            const kick = new THREE.Vector3(
              (Math.random() - 0.5) * 6,
              4 + Math.random() * 6,
              (Math.random() - 0.5) * 6
            );
            motion.vel.add(kick);
          }
          if (child.position.y < -7 || child.position.length() > 20) {
            respawnVolcano(child, motion, rolling ? 1.2 : slowing ? 0.4 : 0.5);
          }
          child.lookAt(camera.position);
        }
      }

      applyWinnerFocus(cards, phase, winners, camera, mode === "globe");
    },
  };
}

function applyWinnerFocus(
  cards: THREE.Group,
  phase: ScreenPhase,
  winners: ScreenWinner[],
  camera: THREE.Camera,
  globe: boolean
) {
  if (phase !== "result" || winners.length === 0) return;
  const primary = winners[0]!.participantId;
  const target = new THREE.Vector3(0, 0.8, globe ? SPHERE_RADIUS + 0.8 : 5.5);
  cards.children.forEach((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mat = child.material as THREE.MeshBasicMaterial;
    const id = child.userData.participantId as number;
    if (id === primary) {
      child.scale.lerp(new THREE.Vector3(1.8, 1.8, 1.8), 0.06);
      child.position.lerp(target, 0.05);
      child.lookAt(camera.position);
      mat.opacity = 1;
    } else {
      mat.opacity = Math.max(0.12, mat.opacity * 0.98);
    }
  });
}