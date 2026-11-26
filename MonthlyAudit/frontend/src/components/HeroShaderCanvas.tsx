import { useEffect, useRef } from "react";
import * as THREE from "three";

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uMouse;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    vec2 mouseOffset = (uMouse - 0.5) * 0.25;
    float n1 = noise(p * 3.2 + vec2(uTime * 0.08, -uTime * 0.05) + mouseOffset);
    float n2 = noise(p * 6.5 - vec2(uTime * 0.06, uTime * 0.09));
    float field = n1 * 0.65 + n2 * 0.35;

    float contour = abs(fract(field * 6.0) - 0.5);
    float line = smoothstep(0.028, 0.004, contour);

    vec3 obsidian = vec3(0.022, 0.030, 0.048);
    vec3 slateGlow = vec3(0.08, 0.12, 0.20);
    vec3 softlanOrange = vec3(1.0, 0.353, 0.122);

    float distMouse = length(p - mouseOffset * 1.4);
    float radialGlow = exp(-distMouse * 2.4);

    vec3 color = mix(obsidian, slateGlow, field * 0.55);
    color += softlanOrange * line * (0.20 + radialGlow * 0.45);
    color += softlanOrange * radialGlow * 0.08;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function HeroShaderCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

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
    };

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
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: -10,
        pointerEvents: "none",
        overflow: "hidden",
      }}
      aria-hidden="true"
    />
  );
}