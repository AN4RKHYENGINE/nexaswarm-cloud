/* ============================================
   NEXASWARM OCEAN — Final Cinematic Master
   World-space Gerstner + distance LOD · true sky
   reflection via fresnel · anisotropic moon glitter ·
   subsurface · streak foam · moonlit cirrus · dithering
   ============================================ */
(function() {
  "use strict";
  var canvas = document.getElementById("ocean");

  // ===== MOBILE DETECTION =====
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 900;
  console.log("[Ocean] Mobile:", isMobile, "Size:", window.innerWidth + "x" + window.innerHeight);

  if (!canvas || typeof THREE === "undefined") { window.dispatchEvent(new Event("ocean-ready")); return; }

  try {
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !isMobile, alpha: false, powerPreference: isMobile ? "low-power" : "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.32;
    renderer.outputEncoding = THREE.sRGBEncoding;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 7, 30);
    camera.lookAt(0, 1.5, -60);

    var MOON_POS = new THREE.Vector3(-140, 110, -420);
    var MOON_DIR = MOON_POS.clone().normalize();
    var HORIZON = new THREE.Color(0.016, 0.042, 0.075);

    var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    window.addEventListener("mousemove", function(e) {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    /* Shared GLSL: noise + sky model (identical in dome and water) */
    var NOISE_GLSL = [
      "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }",
      "float hash13(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }",
      "float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);",
      "  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }",
      "float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<3;i++){ v+=a*vnoise(p); p=p*2.03+17.1; a*=0.5; } return v; }"
    ].join("\n");

    var SKY_GLSL = [
      "uniform vec3 uMoonDir; uniform vec3 uHorizon; uniform float uTime;",
      NOISE_GLSL,
      "vec3 skyColor(vec3 d){",
      "  float h = d.y;",
      "  vec3 col = mix(uHorizon, vec3(0.006,0.016,0.036), smoothstep(-0.02,0.18,h));",
      "  col = mix(col, vec3(0.002,0.005,0.014), smoothstep(0.18,0.65,h));",
      "  float md = max(dot(d, uMoonDir), 0.0);",
      "  col += vec3(0.28,0.34,0.46) * pow(md, 40.0) * 0.35;",
      "  col += vec3(0.05,0.08,0.13) * pow(md, 6.0) * 0.25;",
      "  float band = smoothstep(0.04,0.22,h) * (1.0 - smoothstep(0.35,0.75,h));",
      "  vec2 cuv = d.xz / max(h, 0.08);",
      "  float cl = fbm(cuv * 0.35 + vec2(uTime*0.006, uTime*0.002));",
      "  cl = smoothstep(0.48, 0.88, cl) * band;",
      "  col += vec3(0.045,0.055,0.075) * cl * (0.35 + 0.65*pow(md,2.0));",
      "  return col;",
      "}",
      "vec3 dither(vec3 col){ return col + (hash(gl_FragCoord.xy) - 0.5) / 255.0; }"
    ].join("\n");

    /* ---------- SKY DOME ---------- */
    var skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uMoonDir: { value: MOON_DIR },
        uHorizon: { value: HORIZON },
        uTime: { value: 0 }
      },
      vertexShader: "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: SKY_GLSL + [
        "varying vec3 vDir;",
        "void main(){ gl_FragColor = vec4(dither(skyColor(normalize(vDir))), 1.0); }"
      ].join("\n"),
      side: THREE.BackSide, depthWrite: false
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(900, 32, 24), skyMat));

    /* ---------- STARS ---------- */
    (function() {
      var n = 2200, pos = new Float32Array(n*3), sz = new Float32Array(n), ph = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        var th = Math.random()*Math.PI*2, phi = Math.acos(Math.random()*0.92+0.04), r = 600+Math.random()*250;
        pos[i*3] = r*Math.sin(phi)*Math.cos(th);
        pos[i*3+1] = Math.abs(r*Math.cos(phi))+40;
        pos[i*3+2] = r*Math.sin(phi)*Math.sin(th)-200;
        sz[i] = Math.pow(Math.random(),2.2)*3.0+0.6;
        ph[i] = Math.random()*Math.PI*2;
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos,3));
      g.setAttribute("aSize", new THREE.BufferAttribute(sz,1));
      g.setAttribute("aPhase", new THREE.BufferAttribute(ph,1));
      var m = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: "attribute float aSize; attribute float aPhase; uniform float uTime; varying float vA; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; float tw=sin(uTime*1.8+aPhase)*0.5+0.5; tw*=tw; vA=0.25+tw*0.75; gl_PointSize=aSize*(1.0+tw*0.7)*(260.0/-mv.z); }",
        fragmentShader: "varying float vA; void main(){ vec2 c=2.0*gl_PointCoord-1.0; float r=dot(c,c); if(r>1.0) discard; gl_FragColor=vec4(vec3(0.92,0.96,1.0), pow(1.0-sqrt(r),1.8)*vA); }",
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      var s = new THREE.Points(g, m); s.name = "stars"; scene.add(s);
    

  // ===== CONTEXT LOSS HANDLING =====
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    console.log("[Ocean] Context lost");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    console.log("[Ocean] Context restored");
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  });

})();

    /* ---------- MOON + CORONA ---------- */
    var moon = new THREE.Mesh(new THREE.SphereGeometry(14,48,48), new THREE.MeshBasicMaterial({ color: 0xf4f6ff }));
    moon.position.copy(MOON_POS); scene.add(moon);
    var c1 = new THREE.Mesh(new THREE.SphereGeometry(20,48,48), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.10 }));
    c1.position.copy(MOON_POS); scene.add(c1);
    var c2 = new THREE.Mesh(new THREE.SphereGeometry(30,48,48), new THREE.MeshBasicMaterial({ color: 0xc8d8ff, transparent: true, opacity: 0.05 }));
    c2.position.copy(MOON_POS); scene.add(c2);

    /* ---------- OCEAN ---------- */
    var U = {
      uTime: { value: 0 },
      uCamPos: { value: camera.position },
      uMoonPos: { value: MOON_POS },
      uMoonDir: { value: MOON_DIR },
      uHorizon: { value: HORIZON }
    };

    var oceanMat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: [
        "uniform float uTime; uniform vec3 uCamPos;",
        "varying vec3 vWorldPos; varying vec3 vNormal; varying float vCrest;",
        "void gerstner(vec2 dir, float steep, float wl, float amp, vec2 p, float t, inout vec3 disp, inout vec3 nrm){",
        "  float k = 6.283185 / wl;",
        "  float w = sqrt(9.81 * k);",
        "  vec2 d = normalize(dir);",
        "  float f = k * (dot(d, p) - (w / k) * t);",
        "  disp.x += d.x * steep * amp * cos(f);",
        "  disp.z += d.y * steep * amp * cos(f);",
        "  disp.y += amp * sin(f);",
        "  nrm.x -= d.x * w * amp * cos(f);",
        "  nrm.z -= d.y * w * amp * cos(f);",
        "  nrm.y -= steep * w * amp * sin(f);",
        "}",
        "void main(){",
        "  vec2 p = position.xy;",
        "  float lod = 1.0 - smoothstep(80.0, 340.0, length(vec3(p.x, 0.0, p.y) - uCamPos));",
        "  vec3 disp = vec3(0.0); vec3 nrm = vec3(0.0, 1.0, 0.0);",
        "  gerstner(vec2( 0.9,  0.10), 0.10, 120.0, 2.30, p, uTime*0.6, disp, nrm);",
        "  gerstner(vec2( 1.0,  0.25), 0.24, 70.0, 1.95, p, uTime, disp, nrm);",
        "  gerstner(vec2( 0.6,  0.90), 0.21, 38.0, 1.10, p, uTime, disp, nrm);",
        "  gerstner(vec2(-0.4,  0.80), 0.18, 22.0, 0.62, p, uTime, disp, nrm);",
        "  gerstner(vec2( 0.85,-0.30), 0.14, 12.5, 0.32*(0.6+0.4*lod), p, uTime, disp, nrm);",
        "  gerstner(vec2(-0.75,-0.55), 0.12,  7.8, 0.19*(0.4+0.6*lod), p, uTime, disp, nrm);",
        "  gerstner(vec2( 0.25, 0.95), 0.10,  4.9, 0.11*(0.2+0.8*lod), p, uTime*1.3, disp, nrm);",
        "  gerstner(vec2(-0.95, 0.20), 0.08,  3.2, 0.06*lod, p, uTime*1.6, disp, nrm);",
        "  vCrest = disp.y;",
        "  vec3 wpos = vec3(p.x + disp.x, disp.y, p.y + disp.z);",
        "  vNormal = normalize(nrm);",
        "  vWorldPos = wpos;",
        "  gl_Position = projectionMatrix * viewMatrix * vec4(wpos, 1.0);",
        "}"
      ].join("\n"),
      fragmentShader: SKY_GLSL + [
        "uniform vec3 uCamPos; uniform vec3 uMoonPos;",
        "varying vec3 vWorldPos; varying vec3 vNormal; varying float vCrest;",
        "void main(){",
        "  vec2 wp = vWorldPos.xz; float t = uTime;",
        "  float dist = length(uCamPos - vWorldPos);",
        "  float detailFade = 1.0 - smoothstep(70.0, 340.0, dist);",
        "",
        "  vec2 q = vec2(fbm(wp*0.30 + vec2(t*0.055, t*0.038)), fbm(wp*0.30 + vec2(-t*0.047, t*0.062) + 5.2));",
        "  vec2 r = vec2(fbm(wp*0.85 + 3.5*q + vec2(t*0.085,-t*0.055)), fbm(wp*0.85 + 3.5*q + vec2(-t*0.065, t*0.078) + 8.3));",
        "  vec3 N = normalize(vNormal + vec3((r.x-0.5)*0.75, 0.0, (r.y-0.5)*0.75) * (0.30 + 0.70*detailFade));",
        "",
        "  vec3 V = normalize(uCamPos - vWorldPos);",
        "  vec3 L = normalize(uMoonPos - vWorldPos);",
        "",
        "  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(V,N),0.0), 5.0);",
        "  vec3 waterCol = mix(vec3(0.012,0.052,0.092), vec3(0.034,0.118,0.168), smoothstep(-1.4,1.6,vCrest));",
        "  waterCol += vec3(0.004,0.020,0.026) * smoothstep(0.10,0.50,V.y);",
        "",
        "  vec3 R = reflect(-V, N);",
        "  R.y = max(R.y, 0.03);",
        "  float nearGlow = smoothstep(60.0, 10.0, dist) * 0.18; waterCol += vec3(0.020, 0.060, 0.090) * nearGlow; vec3 col = mix(waterCol, skyColor(normalize(R)), fres);",
        "  float ndl = max(dot(N, L), 0.0);",
        "  col += vec3(0.50,0.62,0.78) * pow(ndl, 2.0) * 0.12;",
        "  col += vec3(0.09,0.20,0.30) * (N.y * 0.5 + 0.5) * 0.14;",
        "  float column = pow(max(dot(R, uMoonDir), 0.0), 10.0);",
        "  col += vec3(0.32,0.40,0.52) * column * 0.25 * (0.5 + 0.5*detailFade);",
        "",
        "  vec2 vd = normalize(V.xz + vec2(1e-4));",
        "  vec2 guv = vec2(dot(wp, vd), dot(wp, vec2(-vd.y, vd.x)) * 3.0);",
        "  float glitter = pow(vnoise(guv * 3.5 + vec2(t*2.0, 0.0)), 6.0);",
        "  float spec = pow(max(dot(N, normalize(L+V)), 0.0), 220.0) * 6.5;",
        "  spec *= 0.35 + 2.6 * glitter * detailFade;",
        "  col += vec3(0.95,0.96,1.0) * spec;",
        "",
        "  col += vec3(0.020,0.140,0.170) * pow(max(dot(V,-L+N*0.55),0.0),2.5) * smoothstep(0.05,1.2,vCrest) * 1.9;",
        "",
        "  float fn = fbm(wp*1.35 + vec2(t*0.14,-t*0.09) + 3.1*q);",
        "  float streak = fbm(vec2(wp.x*0.55 + wp.y*0.18, wp.y*2.2) - t*0.16);",
        "  float foam = smoothstep(0.65,1.4,vCrest) * smoothstep(0.40,0.70,fn) * (0.60+0.40*streak);",
        "  col = mix(col, vec3(0.78,0.85,0.92), foam*0.70);",
        "",
        "  col = mix(col, uHorizon, smoothstep(140.0,520.0,dist));",
        "  gl_FragColor = vec4(dither(col), 1.0);",
        "}"
      ].join("\n")
    });

    var ocean = new THREE.Mesh(new THREE.PlaneGeometry(700, 700, 210, 210), oceanMat);
    scene.add(ocean);

    /* ---------- BIOLUMINESCENCE ---------- */
    (function() {
      var n = 700, pos = new Float32Array(n*3), ph = new Float32Array(n), sz = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        pos[i*3] = (Math.random()-0.5)*260;
        pos[i*3+1] = Math.random()*2.5 - 3.5;
        pos[i*3+2] = (Math.random()-0.5)*260;
        ph[i] = Math.random()*Math.PI*2;
        sz[i] = Math.random()*2.5+1.2;
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos,3));
      g.setAttribute("aPhase", new THREE.BufferAttribute(ph,1));
      g.setAttribute("aSize", new THREE.BufferAttribute(sz,1));
      var m = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: "attribute float aPhase; attribute float aSize; uniform float uTime; varying float vA; void main(){ vec3 p=position; p.y+=sin(uTime*0.45+aPhase)*0.5; p.x+=sin(uTime*0.28+aPhase*2.1)*0.4; float pulse=sin(uTime*2.2+aPhase*3.7)*0.5+0.5; vA=pow(pulse,3.0)*0.85; vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=aSize*(130.0/-mv.z); }",
        fragmentShader: "varying float vA; void main(){ vec2 c=2.0*gl_PointCoord-1.0; float r=dot(c,c); if(r>1.0) discard; gl_FragColor=vec4(vec3(0.05,0.85,1.0), pow(1.0-sqrt(r),2.2)*vA); }",
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      var b = new THREE.Points(g, m); b.name = "bio"; scene.add(b);
    

  // ===== CONTEXT LOSS HANDLING =====
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    console.log("[Ocean] Context lost");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    console.log("[Ocean] Context restored");
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  });

})();

    /* ---------- ADAPTIVE QUALITY ---------- */
    var maxPR = Math.min(window.devicePixelRatio, 2);
    var qa = { pr: maxPR, acc: 0, frames: 0, last: performance.now() };
    function adaptQuality() {
      var now = performance.now();
      qa.acc += now - qa.last; qa.last = now; qa.frames++;
      if (qa.frames >= 90) {
        var avg = qa.acc / qa.frames;
        if (avg > 24 && qa.pr > 1.0) {
          qa.pr = Math.max(1.0, qa.pr - 0.25);
          renderer.setPixelRatio(qa.pr); renderer.setSize(window.innerWidth, window.innerHeight);
        } else if (avg < 14 && qa.pr < maxPR) {
          qa.pr = Math.min(maxPR, qa.pr + 0.25);
          renderer.setPixelRatio(qa.pr); renderer.setSize(window.innerWidth, window.innerHeight);
        }
        qa.acc = 0; qa.frames = 0;
      }
    }

    /* ---------- ANIMATE ---------- */
    var clock = new THREE.Clock();
    var starsMat = scene.getObjectByName("stars").material;
    var bioMat = scene.getObjectByName("bio").material;

    (function animate() {
      requestAnimationFrame(animate);
      var t = clock.getElapsedTime();
      adaptQuality();
      U.uTime.value = t * 1.6;
      skyMat.uniforms.uTime.value = t;
      starsMat.uniforms.uTime.value = t;
      bioMat.uniforms.uTime.value = t;
      mouse.x += (mouse.tx - mouse.x) * 0.025;
      mouse.y += (mouse.ty - mouse.y) * 0.025;
      var ct = t * 1.5;
      camera.position.x = mouse.x * 3.0 + Math.sin(ct*0.09)*2.2;
      camera.position.y = 7 + mouse.y * 1.4 + Math.sin(ct*0.07)*0.7 + Math.sin(ct*1.1)*0.10 + Math.sin(ct*1.9)*0.04;
      camera.position.z = 30 + Math.sin(ct*0.06)*1.5;
      camera.lookAt(0, 1.5, -60);
      c1.scale.setScalar(1 + Math.sin(t*0.4)*0.04);
      c2.scale.setScalar(1 + Math.sin(t*0.27+1.3)*0.06);
      renderer.render(scene, camera);
    

  // ===== CONTEXT LOSS HANDLING =====
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    console.log("[Ocean] Context lost");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    console.log("[Ocean] Context restored");
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  });

})();

    window.addEventListener("resize", function() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    console.log("🌊 Ocean master build online");
    setTimeout(function(){ window.dispatchEvent(new Event("ocean-ready")); }, 900);
  } catch (e) {
    console.error("Ocean error:", e);
    window.dispatchEvent(new Event("ocean-ready"));
  }


  // ===== CONTEXT LOSS HANDLING =====
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    console.log("[Ocean] Context lost");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    console.log("[Ocean] Context restored");
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  });

})();
