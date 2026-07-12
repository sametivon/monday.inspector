/* ═══════════════════════════════════════════════════════════════════
   Monday.com Inspector — Flowing gradient mesh hero (three.js)
   ───────────────────────────────────────────────────────────────────
   Renders a soft, animated purple→blue gradient behind any element that
   contains a <canvas class="hero-canvas">. Domain-warped simplex noise
   gives it a slow, liquid "aurora" motion in the brand palette.

   Robustness:
   • No THREE / no WebGL / no canvas  → silently bails, CSS fallback shows.
   • prefers-reduced-motion           → paints ONE static frame, no loop.
   • Canvas scrolled off-screen / tab hidden → animation pauses (battery).
   • DPR capped at 2                   → sharp on retina, cheap on 4K.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var canvas = document.querySelector("canvas.hero-canvas");
  if (!canvas || typeof THREE === "undefined") return;

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch (err) {
    // WebGL unavailable — leave the CSS gradient fallback in place.
    canvas.style.display = "none";
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  canvas.classList.add("webgl-live"); // WebGL owns it now — drop CSS fallback

  var scene = new THREE.Scene();
  var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  var uniforms = {
    u_time: { value: 0 },
    u_res: { value: new THREE.Vector2(1, 1) },
    u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
    // strength lets article heroes render a subtler wash than the homepage
    u_strength: { value: parseFloat(canvas.getAttribute("data-strength")) || 1.0 },
  };

  var vertexShader = "void main(){ gl_Position = vec4(position, 1.0); }";

  var fragmentShader = [
    "precision highp float;",
    "uniform float u_time;",
    "uniform vec2  u_res;",
    "uniform vec2  u_mouse;",
    "uniform float u_strength;",

    // ── Ashima simplex noise ──────────────────────────────
    "vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}",
    "vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}",
    "vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}",
    "float snoise(vec2 v){",
    "  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);",
    "  vec2 i=floor(v+dot(v,C.yy));",
    "  vec2 x0=v-i+dot(i,C.xx);",
    "  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);",
    "  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;",
    "  i=mod289(i);",
    "  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));",
    "  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);",
    "  m=m*m; m=m*m;",
    "  vec3 x=2.0*fract(p*C.www)-1.0;",
    "  vec3 h=abs(x)-0.5;",
    "  vec3 ox=floor(x+0.5);",
    "  vec3 a0=x-ox;",
    "  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);",
    "  vec3 g;",
    "  g.x=a0.x*x0.x+h.x*x0.y;",
    "  g.yz=a0.yz*x12.xz+h.yz*x12.yw;",
    "  return 130.0*dot(m,g);",
    "}",

    "float fbm(vec2 p){",
    "  float f=0.0, amp=0.5;",
    "  for(int i=0;i<5;i++){ f+=amp*snoise(p); p*=2.0; amp*=0.5; }",
    "  return f;",
    "}",

    "void main(){",
    "  vec2 uv=gl_FragCoord.xy/u_res.xy;",
    "  vec2 asp=vec2(u_res.x/u_res.y,1.0);",
    "  vec2 p=uv*asp;",
    "  float t=u_time*0.05;",

    // domain warp → flowing, liquid motion
    "  vec2 q=vec2(fbm(p*1.3+vec2(0.0,t)), fbm(p*1.3+vec2(5.2,t*0.8)));",
    "  vec2 r=vec2(fbm(p*1.3+2.0*q+vec2(1.7,9.2)+t*0.4), fbm(p*1.3+2.0*q+vec2(8.3,2.8)+t*0.3));",
    "  float n=fbm(p*1.3+2.4*r);",
    "  n=n*0.5+0.5;",

    // brand palette (near-white base keeps hero text readable)
    "  vec3 base=vec3(0.980,0.976,1.000);",     // #fafaff
    "  vec3 col1=vec3(0.486,0.361,0.988);",     // #7c5cfc
    "  vec3 col2=vec3(0.655,0.545,0.980);",     // #a78bfa
    "  vec3 col3=vec3(0.451,0.541,0.980);",     // periwinkle-blue
    "  vec3 col4=vec3(0.847,0.882,1.000);",     // light blue

    "  vec3 col=mix(col4,col2,smoothstep(0.20,0.55,n));",
    "  col=mix(col,col1,smoothstep(0.50,0.82,n)*(0.55+0.45*length(q)));",
    "  col=mix(col,col3,smoothstep(0.62,0.96,n)*0.5);",

    // lift toward base so it stays a soft pastel wash
    "  col=mix(base,col,(0.50+0.30*n)*u_strength);",

    // cursor-follow glow
    "  float md=distance(uv,u_mouse);",
    "  col+=(col1-base)*0.10*smoothstep(0.45,0.0,md)*u_strength;",

    // radial edge fade → alpha, blends the canvas into the page
    "  float d=distance(uv,vec2(0.5));",
    "  float alpha=smoothstep(0.98,0.30,d)*0.92;",

    "  gl_FragColor=vec4(col,alpha);",
    "}",
  ].join("\n");

  var material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    transparent: true,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  function resize() {
    var w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    uniforms.u_res.value.set(w, h);
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  window.addEventListener(
    "pointermove",
    function (e) {
      uniforms.u_mouse.value.set(
        e.clientX / window.innerWidth,
        1.0 - e.clientY / window.innerHeight
      );
    },
    { passive: true }
  );

  function renderFrame(seconds) {
    uniforms.u_time.value = seconds;
    renderer.render(scene, camera);
  }

  if (reduceMotion) {
    renderFrame(2.0); // one pleasant static frame
    return;
  }

  var raf = null,
    startTs = null,
    onScreen = true,
    tabVisible = true;

  function tick(now) {
    if (!onScreen || !tabVisible) {
      raf = null;
      return;
    }
    if (startTs === null) startTs = now;
    renderFrame((now - startTs) * 0.001);
    raf = requestAnimationFrame(tick);
  }
  function play() {
    if (raf === null && onScreen && tabVisible) raf = requestAnimationFrame(tick);
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      // resume from current clock so paused time doesn't fast-forward
      if (onScreen) startTs = null;
      play();
    }).observe(canvas);
  }
  document.addEventListener("visibilitychange", function () {
    tabVisible = !document.hidden;
    if (tabVisible) startTs = null;
    play();
  });

  play();
})();
