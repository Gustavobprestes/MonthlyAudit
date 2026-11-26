import { useEffect, useRef } from "react";
import * as THREE from "three";

export function HeroShaderCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const uniforms = {
      u_time: { value: 0 },
      u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
      u_resolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float u_time;
        uniform vec2 u_mouse;
        uniform vec2 u_resolution;
        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution.xy;
          vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
          vec2 m = (u_mouse - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

          // Linhas topográficas cinéticas estilo telemetria / Lando Norris
          float n = noise(p * 3.2 + u_time * 0.14 - m * 0.65);
          float n2 = noise(p * 6.5 - u_time * 0.09 + m * 0.35);
          float contour = abs(fract((n * 0.7 + n2 * 0.3) * 7.0) - 0.5);
          float line = smoothstep(0.035, 0.0, contour);

          // Bloom radial interativo no cursor (Laranja Softlan + Prata Metálico)
          float dist = length(p - m);
          float mouseGlow = exp(-dist * 3.4) * 0.55;

          // Feixes prismáticos laterais estilo Better Stack
          float beamLeft = exp(-abs(p.x + 0.72 + p.y * 0.35) * 7.5) * 0.25;
          float beamRight = exp(-abs(p.x - 0.72 - p.y * 0.35) * 7.5) * 0.25;

          vec3 baseDark = vec3(0.02, 0.028, 0.045);
          vec3 softlanOrange = vec3(1.0, 0.35, 0.12);
          vec3 titaniumSilver = vec3(0.55, 0.62, 0.75);

          vec3 col = baseDark;
          col += titaniumSilver * line * 0.18;
          col += softlanOrange * line * mouseGlow * 1.4;
          col += softlanOrange * mouseGlow * 0.38;
          col += titaniumSilver * (beamLeft + beamRight);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    const targetMouse = new THREE.Vector2(0.5, 0.5);

    const onMouseMove = (e: MouseEvent) => {
      targetMouse.x = e.clientX / window.innerWidth;
      targetMouse.y = 1.0 - e.clientY / window.innerHeight;
    };

    const onResize = () => {
      if (!container) return;
      renderer.setSize(container.clientWidth, container.clientHeight);
      uniforms.u_resolution.value.set(container.clientWidth, container.clientHeight);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize", onResize);

    let rafId = 0;
    const animate = (t: number) => {
      uniforms.u_time.value = t * 0.001;
      uniforms.u_mouse.value.lerp(targetMouse, 0.06);
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      material.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="fixed inset-0 -z-10 pointer-events-none" />;
}