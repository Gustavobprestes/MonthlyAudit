import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { AppTheme } from "../types/audit";

const THEME_PALETTES: Record<
  AppTheme,
  { base: [number, number, number]; glow: [number, number, number]; line: [number, number, number] }
> = {
  softlan: {
    base: [0.024, 0.035, 0.058],
    glow: [0.08, 0.12, 0.21],
    line: [1.0, 0.353, 0.122],
  },
  dracula: {
    base: [0.11, 0.115, 0.16],
    glow: [0.22, 0.18, 0.34],
    line: [1.0, 0.475, 0.776],
  },
  glass: {
    base: [0.04, 0.075, 0.14],
    glow: [0.1, 0.22, 0.36],
    line: [0.22, 0.74, 0.97],
  },
  dark: {
    base: [0.035, 0.035, 0.04],
    glow: [0.11, 0.11, 0.13],
    line: [0.97, 0.45, 0.09],
  },
  light: {
    base: [0.94, 0.96, 0.98],
    glow: [0.86, 0.9, 0.95],
    line: [0.92, 0.34, 0.05],
  },
  cloud: {
    base: [0.88, 0.95, 0.99],
    glow: [0.76, 0.89, 0.98],
    line: [0.01, 0.52, 0.78],
  },
  cyberpunk: {
    base: [0.032, 0.014, 0.085],
    glow: [0.16, 0.045, 0.29],
    line: [0.99, 0.93, 0.04],
  },
};

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// Simplex Noise 2D analítico (Ian McEwan / Ashima Arts): zero bordas de grade, zero costuras em movimento
const FRAGMENT_SHADER = `
  precision highp float;
  uniform float uTime;
  uniform float uAspect;
  uniform vec2 uMouse;
  uniform vec3 uBaseColor;
  uniform vec3 uGlowColor;
  uniform vec3 uLineColor;
  varying vec2 vUv;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(
      0.211324865405187,
      0.366025403784439,
      -0.577350269189626,
      0.024390243902439
    );
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 centered = (vUv - 0.5) * vec2(uAspect, 1.0);
    vec2 mouseOffset = (uMouse - 0.5) * vec2(uAspect, 1.0) * 0.22;

    float n1 = snoise(centered * 1.45 + vec2(uTime * 0.04, -uTime * 0.03) + mouseOffset);
    float n2 = snoise(centered * 2.65 - vec2(uTime * 0.028, uTime * 0.045) - mouseOffset * 0.5);
    float field = 0.5 + 0.35 * n1 + 0.15 * n2;

    float contour = abs(sin(field * 15.707963));
    float line = smoothstep(0.105, 0.012, contour);

    float distMouse = length(centered - mouseOffset * 1.35);
    float radialGlow = exp(-distMouse * 2.0);

    vec3 color = mix(uBaseColor, uGlowColor, clamp(field, 0.0, 1.0) * 0.62);
    color = mix(color, uLineColor, line * (0.28 + radialGlow * 0.42));
    color = mix(color, uLineColor, radialGlow * 0.08);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function HeroShaderCanvas({ theme = "softlan" }: { theme?: AppTheme }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const targetPaletteRef = useRef(THEME_PALETTES[theme] || THEME_PALETTES.softlan);

  useEffect(() => {
    targetPaletteRef.current = THEME_PALETTES[theme] || THEME_PALETTES.softlan;
  }, [theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getBoxSize = () => ({
      width: container.clientWidth || document.documentElement.clientWidth || window.innerWidth,
      height: container.clientHeight || document.documentElement.clientHeight || window.innerHeight,
    });

    const { width, height } = getBoxSize();
    const initialPal = targetPaletteRef.current;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    const targetMouse = new THREE.Vector2(0.5, 0.5);

    const uniforms = {
      uTime: { value: 0 },
      uAspect: { value: width / Math.max(height, 1) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uBaseColor: { value: new THREE.Color(...initialPal.base) },
      uGlowColor: { value: new THREE.Color(...initialPal.glow) },
      uLineColor: { value: new THREE.Color(...initialPal.line) },
    };

    const targetBase = new THREE.Color();
    const targetGlow = new THREE.Color();
    const targetLine = new THREE.Color();

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const onPointerMove = (e: PointerEvent) => {
      const box = getBoxSize();
      targetMouse.set(
        e.clientX / Math.max(box.width, 1),
        1.0 - e.clientY / Math.max(box.height, 1)
      );
    };

    const onResize = () => {
      const box = getBoxSize();
      renderer.setSize(box.width, box.height, false);
      uniforms.uAspect.value = box.width / Math.max(box.height, 1);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("resize", onResize);

    let animId = 0;
    const clock = new THREE.Clock();
    const renderLoop = () => {
      uniforms.uTime.value = clock.getElapsedTime();

      // Suavização contínua do cursor e das cores dos temas
      uniforms.uMouse.value.lerp(targetMouse, 0.06);

      const pal = targetPaletteRef.current;
      targetBase.setRGB(...pal.base);
      targetGlow.setRGB(...pal.glow);
      targetLine.setRGB(...pal.line);

      uniforms.uBaseColor.value.lerp(targetBase, 0.025);
      uniforms.uGlowColor.value.lerp(targetGlow, 0.025);
      uniforms.uLineColor.value.lerp(targetLine, 0.025);

      renderer.render(scene, camera);
      animId = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        zIndex: 0,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    />
  );
}