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

// Hash livre de seno + interpolação quíntica: elimina 100% de quebras/costuras em todos os temas
const FRAGMENT_SHADER = `
  precision highp float;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uMouse;
  uniform vec3 uBaseColor;
  uniform vec3 uGlowColor;
  uniform vec3 uLineColor;
  varying vec2 vUv;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // Curva quíntica de continuidade C2 (zero costura nas bordas de célula)
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

    float a = hash12(i + vec2(0.0, 0.0));
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / max(uResolution.xy, vec2(1.0));
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    // Deslocamento positivo evita qualquer singularidade em torno de 0.0
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0) + vec2(17.3, 29.7);

    vec2 mouseOffset = (uMouse - 0.5) * 0.22;
    float n1 = smoothNoise(p * 2.8 + vec2(uTime * 0.06, -uTime * 0.04) + mouseOffset);
    float n2 = smoothNoise(p * 5.2 - vec2(uTime * 0.04, uTime * 0.07));
    float field = n1 * 0.65 + n2 * 0.35;

    float triWave = abs(2.0 * fract(field * 5.2) - 1.0);
    float line = smoothstep(0.065, 0.008, triWave);

    vec2 centered = (uv - 0.5) * vec2(aspect, 1.0);
    float distMouse = length(centered - mouseOffset * 1.3);
    float radialGlow = exp(-distMouse * 2.2);

    vec3 color = mix(uBaseColor, uGlowColor, field * 0.6);
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

    const width = window.innerWidth;
    const height = window.innerHeight;
    const initialPal = targetPaletteRef.current;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = "100vw";
    renderer.domElement.style.height = "100vh";
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    const uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(width, height) },
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
      uniforms.uMouse.value.set(
        e.clientX / Math.max(window.innerWidth, 1),
        1.0 - e.clientY / Math.max(window.innerHeight, 1)
      );
    };

    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      uniforms.uResolution.value.set(w, h);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("resize", onResize);

    let animId = 0;
    const clock = new THREE.Clock();
    const renderLoop = () => {
      uniforms.uTime.value = clock.getElapsedTime();

      // Interpolação suave (lerp) das cores ao trocar de tema
      const pal = targetPaletteRef.current;
      targetBase.setRGB(...pal.base);
      targetGlow.setRGB(...pal.glow);
      targetLine.setRGB(...pal.line);

      uniforms.uBaseColor.value.lerp(targetBase, 0.08);
      uniforms.uGlowColor.value.lerp(targetGlow, 0.08);
      uniforms.uLineColor.value.lerp(targetLine, 0.08);

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
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    />
  );
}