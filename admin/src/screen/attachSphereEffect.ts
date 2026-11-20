import * as THREE from "three";
import type { SphereEffectId } from "./sphereEffectsMeta";

const SPHERE_RADIUS = 4.2;

export type EffectColors = {
  accent: string;
  accent2: string;
};

export type SphereEffectHandle = {
  group: THREE.Group;
  update: (dt: number, elapsed: number) => void;
  dispose: () => void;
};

function hex(color: string): number {
  return new THREE.Color(color).getHex();
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
      child.geometry.dispose();
      const m = child.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
    }
  });
}

export function attachSphereEffect(
  effectId: SphereEffectId,
  colors: EffectColors
): SphereEffectHandle {
  const group = new THREE.Group();
  let update: (dt: number, elapsed: number) => void = () => {};
  const disposers: (() => void)[] = [];

  if (effectId === "classic") {
    const geo = new THREE.IcosahedronGeometry(SPHERE_RADIUS * 0.98, 3);
    const mat = new THREE.MeshBasicMaterial({
      color: hex(colors.accent),
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    });
    const shell = new THREE.Mesh(geo, mat);
    group.add(shell);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(SPHERE_RADIUS * 1.05, 32, 32),
      new THREE.MeshBasicMaterial({
        color: hex(colors.accent2),
        transparent: true,
        opacity: 0.04,
        depthWrite: false,
      })
    );
    group.add(halo);
    update = (_dt, elapsed) => {
      shell.rotation.y = elapsed * 0.08;
      shell.rotation.x = Math.sin(elapsed * 0.15) * 0.12;
    };
    disposers.push(() => disposeObject(group));
  } else if (effectId === "stars") {
    const count = 2200;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 12 + Math.random() * 28;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      sizes[i] = 0.4 + Math.random() * 1.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.08,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    group.add(points);
    const accentDots = new THREE.Points(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.BufferAttribute(positions.slice(0, 600 * 3), 3)
      ),
      new THREE.PointsMaterial({
        color: hex(colors.accent2),
        size: 0.12,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    group.add(accentDots);
    update = (dt, elapsed) => {
      group.rotation.y += dt * 0.02;
      mat.opacity = 0.7 + Math.sin(elapsed * 1.2) * 0.12;
    };
    disposers.push(() => disposeObject(group));
  } else if (effectId === "ocean") {
    const count = 1600;
    const positions = new Float32Array(count * 3);
    const baseY = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 18;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 2] = Math.sin(angle) * r;
      const y = -3.5 + Math.random() * 2.5;
      positions[i * 3 + 1] = y;
      baseY[i] = y;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: hex(colors.accent),
      size: 0.14,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const waves = new THREE.Points(geo, mat);
    group.add(waves);
    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    update = (_dt, elapsed) => {
      for (let i = 0; i < count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        posAttr.setY(i, baseY[i]! + Math.sin(x * 0.35 + elapsed * 1.4) * 0.35 + Math.cos(z * 0.3 + elapsed) * 0.25);
      }
      posAttr.needsUpdate = true;
      group.rotation.y = Math.sin(elapsed * 0.2) * 0.15;
    };
    disposers.push(() => disposeObject(group));
  } else if (effectId === "fire") {
    type Ember = { mesh: THREE.Mesh; vy: number; vx: number; vz: number; life: number };
    const embers: Ember[] = [];
    const emberGeo = new THREE.PlaneGeometry(0.18, 0.18);
    for (let i = 0; i < 120; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? hex(colors.accent2) : 0xff6b35,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(emberGeo, mat);
      mesh.position.set((Math.random() - 0.5) * 10, -6 + Math.random() * 2, (Math.random() - 0.5) * 10);
      group.add(mesh);
      embers.push({
        mesh,
        vy: 1.2 + Math.random() * 2.5,
        vx: (Math.random() - 0.5) * 0.4,
        vz: (Math.random() - 0.5) * 0.4,
        life: Math.random(),
      });
    }
    const glow = new THREE.PointLight(0xff6622, 1.2, 30);
    glow.position.set(0, -2, 4);
    group.add(glow);
    update = (dt, elapsed) => {
      glow.intensity = 1 + Math.sin(elapsed * 3) * 0.35;
      for (const e of embers) {
        e.life += dt;
        e.mesh.position.y += e.vy * dt;
        e.mesh.position.x += e.vx * dt;
        e.mesh.position.z += e.vz * dt;
        const mat = e.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - e.life * 0.45);
        if (e.mesh.position.y > 8 || e.life > 2.2) {
          e.mesh.position.y = -6 + Math.random();
          e.mesh.position.x = (Math.random() - 0.5) * 10;
          e.mesh.position.z = (Math.random() - 0.5) * 10;
          e.life = 0;
          mat.opacity = 0.85;
        }
      }
    };
    disposers.push(() => {
      emberGeo.dispose();
      disposeObject(group);
    });
  } else if (effectId === "aurora") {
    const bands: THREE.Mesh[] = [];
    for (let b = 0; b < 4; b++) {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.35, colors.accent);
      g.addColorStop(0.65, colors.accent2);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 256);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(14, 9, 1, 1), mat);
      plane.position.set(Math.cos(b * 1.6) * 6, 1, Math.sin(b * 1.6) * 6);
      plane.rotation.y = b * 0.9;
      group.add(plane);
      bands.push(plane);
    }
    update = (_dt, elapsed) => {
      bands.forEach((plane, i) => {
        plane.rotation.z = Math.sin(elapsed * 0.5 + i) * 0.25;
        const mat = plane.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.28 + Math.sin(elapsed * 0.8 + i * 1.2) * 0.12;
      });
      group.rotation.y = elapsed * 0.06;
    };
    disposers.push(() => disposeObject(group));
  }

  return {
    group,
    update,
    dispose: () => disposers.forEach((fn) => fn()),
  };
}

export function sceneFogForEffect(effectId: SphereEffectId): THREE.FogExp2 | null {
  if (effectId === "ocean") return new THREE.FogExp2(0x021a2e, 0.035);
  if (effectId === "fire") return new THREE.FogExp2(0x1a0808, 0.028);
  return null;
}