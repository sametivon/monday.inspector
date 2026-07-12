import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import * as THREE from "three";

/* ────────────────────────────────────────────────────────────────
   A calm, endlessly-drifting mesh gradient in the soft palette, with
   a few translucent floating shapes for depth. Everything moves almost
   imperceptibly; the pointer adds a gentle parallax. Pauses when the
   tab is hidden. SSR-safe: a CSS gradient paints first, the Canvas
   mounts only on the client.
   ──────────────────────────────────────────────────────────────── */

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float u_time;
  uniform vec2  u_res;
  uniform vec2  u_mouse;
  varying vec2  v_uv;

  // cheap value-noise
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),
               mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);
  }

  // soft radial bloom
  float bloom(vec2 uv, vec2 c, float r){
    return smoothstep(r, 0.0, distance(uv, c));
  }

  void main(){
    vec2 uv = v_uv;
    vec2 asp = vec2(u_res.x/u_res.y, 1.0);
    vec2 p = uv * asp;
    float t = u_time * 0.03;
    vec2 m = (u_mouse - 0.5) * 0.10;

    // slowly drifting bloom centres (in aspect space)
    vec2 c1 = vec2(0.24*asp.x, 0.24) + vec2(sin(t*0.9), cos(t*0.7))*0.06 + m*asp;
    vec2 c2 = vec2(0.82*asp.x, 0.30) + vec2(cos(t*0.6), sin(t*0.8))*0.07 - m*asp*0.6;
    vec2 c3 = vec2(0.60*asp.x, 0.92) + vec2(sin(t*0.5), cos(t*0.9))*0.06 + m*asp*0.4;
    vec2 c4 = vec2(0.10*asp.x, 0.82) + vec2(cos(t*0.8), sin(t*0.5))*0.05;

    // organic wobble
    float n = noise(p*2.2 + t) * 0.06;

    vec3 col = vec3(0.980, 0.984, 0.988);           // #FAFBFC paper
    col = mix(col, vec3(0.867,0.933,1.000), bloom(p,c1,0.55+n)*0.55); // soft blue
    col = mix(col, vec3(0.953,0.933,1.000), bloom(p,c2,0.50+n)*0.50); // soft lavender
    col = mix(col, vec3(0.918,0.972,0.949), bloom(p,c3,0.55+n)*0.45); // soft mint
    col = mix(col, vec3(1.000,0.949,0.918), bloom(p,c4,0.45+n)*0.35); // soft peach

    // keep it airy — lift back toward paper
    col = mix(vec3(0.980,0.984,0.988), col, 0.9);

    gl_FragColor = vec4(col, 1.0);
  }
`;

const vertexShader = /* glsl */ `
  varying vec2 v_uv;
  void main(){ v_uv = uv; gl_Position = vec4(position, 1.0); }
`;

function GradientPlane() {
  const mat = useRef<THREE.ShaderMaterial>(null!);
  const { size, viewport } = useThree();
  const uniforms = useRef({
    u_time: { value: 0 },
    u_res: { value: new THREE.Vector2(size.width, size.height) },
    u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
  });

  useEffect(() => {
    uniforms.current.u_res.value.set(size.width, size.height);
  }, [size]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      uniforms.current.u_mouse.value.set(
        e.clientX / window.innerWidth,
        1 - e.clientY / window.innerHeight
      );
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((_, delta) => {
    uniforms.current.u_time.value += delta;
  });

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms.current}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        depthWrite={false}
      />
    </mesh>
  );
}

function FloatingShapes() {
  const { pointer } = useThree();
  const group = useRef<THREE.Group>(null!);
  useFrame(() => {
    if (!group.current) return;
    // gentle pointer parallax
    group.current.rotation.x += (pointer.y * 0.08 - group.current.rotation.x) * 0.03;
    group.current.rotation.y += (pointer.x * 0.12 - group.current.rotation.y) * 0.03;
  });
  const shapes = [
    { p: [-2.6, 1.1, -1], c: "#DDEEFF", s: 0.9 },
    { p: [2.8, 0.4, -2], c: "#F3EEFF", s: 1.15 },
    { p: [1.6, -1.6, -1.5], c: "#EAF8F2", s: 0.7 },
    { p: [-1.9, -1.2, -2.5], c: "#FFF2EA", s: 1.0 },
  ] as const;
  return (
    <group ref={group}>
      {shapes.map((sh, i) => (
        <Float key={i} speed={1.1} rotationIntensity={0.4} floatIntensity={1.2}>
          <mesh position={sh.p as unknown as [number, number, number]} scale={sh.s}>
            <icosahedronGeometry args={[1, 1]} />
            <meshBasicMaterial color={sh.c} transparent opacity={0.35} />
          </mesh>
        </Float>
      ))}
    </group>
  );
}

export default function AmbientBackground() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10"
      style={{
        // instant SSR-safe paint; the Canvas fades in over it
        background:
          "radial-gradient(60% 50% at 22% 20%, #E7F1FF 0%, transparent 60%)," +
          "radial-gradient(50% 45% at 82% 26%, #F3EEFF 0%, transparent 60%)," +
          "radial-gradient(55% 50% at 60% 96%, #EAF8F2 0%, transparent 60%), #FAFBFC",
      }}
    >
      {mounted && (
        <Canvas
          className="!absolute inset-0"
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          dpr={[1, 1.75]}
          camera={{ position: [0, 0, 6], fov: 45 }}
          frameloop="always"
        >
          <GradientPlane />
        </Canvas>
      )}
    </div>
  );
}
