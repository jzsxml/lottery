import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  attachSphereEffect,
  sceneFogForEffect,
  type EffectColors,
} from "./attachSphereEffect";
import { createNameRollSystem } from "./nameRollEngine";
import type { SphereEffectId } from "./sphereEffectsMeta";
import type { SphereRollModeId } from "./sphereRollModesMeta";
import type { ScreenPhase, ScreenPoolPerson, ScreenWinner } from "./types";

type Props = {
  pool: ScreenPoolPerson[];
  phase: ScreenPhase;
  winners: ScreenWinner[];
  effect: SphereEffectId;
  rollMode: SphereRollModeId;
  colors: EffectColors;
};

export function SphereScene({ pool, phase, winners, effect, rollMode, colors }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ phase, winners });
  stateRef.current = { phase, winners };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const fog = sceneFogForEffect(effect);
    if (fog) scene.fog = fog;

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.z = 11;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const backdrop = attachSphereEffect(effect, colors);
    scene.add(backdrop.group);

    const root = new THREE.Group();
    scene.add(root);

    const ambient = new THREE.AmbientLight(0xffffff, effect === "fire" ? 0.45 : 0.65);
    const dir = new THREE.DirectionalLight(
      effect === "fire" ? 0xffccaa : 0xffffff,
      effect === "fire" ? 0.9 : 1.1
    );
    dir.position.set(4, 6, 8);
    scene.add(ambient, dir);

    const roll = createNameRollSystem(rollMode, pool, colors.accent);
    root.add(roll.cards);

    let omega = 0.008;
    let clock = performance.now();
    const startTime = performance.now();
    let raf = 0;

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - clock) / 1000);
      clock = now;
      const elapsed = (now - startTime) / 1000;
      const { phase: p, winners: w } = stateRef.current;

      if (roll.usesRootSpin) {
        if (p === "rolling") omega = THREE.MathUtils.lerp(omega, 2.4, 0.08);
        else if (p === "slowing") omega = THREE.MathUtils.lerp(omega, 0.15, 0.04);
        else if (p === "result") omega = THREE.MathUtils.lerp(omega, 0.05, 0.06);
        else omega = THREE.MathUtils.lerp(omega, 0.25, 0.05);
      }

      roll.update({
        dt,
        elapsed,
        phase: p,
        root,
        omega,
        camera,
        winners: w,
      });
      backdrop.update(dt, elapsed);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      backdrop.dispose();
      roll.cards.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else {
            if (mat.map) mat.map.dispose();
            mat.dispose();
          }
        }
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [pool, effect, rollMode, colors.accent, colors.accent2]);

  return <div ref={mountRef} className="sphere-mount" />;
}