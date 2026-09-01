import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

// ============================================================
//  Low-poly wireframe FPS  ·  black world / white edges
// ============================================================
const PI = Math.PI;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const lerp  = (a,b,t)=>a+(b-a)*t;
const damp  = (a,b,l,dt)=>lerp(a,b,1-Math.pow(l,dt));
const rand  = (a,b)=>a+Math.random()*(b-a);
const pick  = arr=>arr[(Math.random()*arr.length)|0];
const ARENA = 46;                                   // half-size of the level

// ---------- renderer / scene / camera ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040406);
scene.fog = new THREE.Fog(0x040406, 34, 175);   // atmospheric depth — distant wireframe dissolves into the dark (backdrop is fog:false)

const camera = new THREE.PerspectiveCamera(78, innerWidth/innerHeight, 0.05, 3000);
let baseFov = 78;

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.68, 0.75, 0.12);
composer.addPass(bloom);

// ---------- cinematic grade: chromatic aberration + vignette + grain + scanlines + shake/flash ----------
const gradePass = new ShaderPass({
  uniforms: {
    tDiffuse:{value:null}, uTime:{value:0}, uShake:{value:new THREE.Vector2()},
    uFlash:{value:0}, uVig:{value:1.0}, uCA:{value:1.0}, uGrain:{value:0.05}, uScan:{value:0.045},
    uRoll:{value:0}, uRes:{value:new THREE.Vector2(innerWidth,innerHeight)}
  },
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader:`
    uniform sampler2D tDiffuse; uniform float uTime,uFlash,uVig,uCA,uGrain,uScan,uRoll; uniform vec2 uShake,uRes;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 uv=vUv;
      if(uRoll!=0.0){                                          // barrel-roll the IMAGE (camera untouched → no horizon flip)
        float a=uRes.x/uRes.y; vec2 c=uv-0.5; c.x*=a;
        float s=sin(uRoll), co=cos(uRoll);
        c=vec2(c.x*co-c.y*s, c.x*s+c.y*co); c.x/=a; uv=c+0.5;
      }
      uv+=uShake;
      vec2 d=uv-0.5; float r2=dot(d,d);
      vec2 off=d*(uCA*0.007)*(r2*2.2+0.15);
      vec3 col;
      col.r=texture2D(tDiffuse,uv+off).r;
      col.g=texture2D(tDiffuse,uv).g;
      col.b=texture2D(tDiffuse,uv-off).b;
      col*=1.0-uScan*(0.5+0.5*sin(uv.y*uRes.y*1.7));           // scanlines
      float vig=smoothstep(1.15,0.28,length(d)*1.55);
      col*=mix(1.0,vig,uVig);                                  // vignette
      col+=(hash(uv*uRes*0.6+fract(uTime))-0.5)*uGrain;        // film grain
      col+=uFlash;                                             // kill / impact flash
      gl_FragColor=vec4(col,1.0);
    }`
});
composer.addPass(gradePass);

// ---- screen shake + flash (game juice) ----
let trauma=0, flashAmt=0, hitstop=0, fovKick=0;
function addShake(v){ trauma=Math.min(1, trauma+v); }
function addFlash(v){ flashAmt=Math.min(0.6, flashAmt+v); }
function updatePost(dt){
  const u=gradePass.uniforms;
  u.uTime.value=(u.uTime.value+dt)%1000;
  const s=trauma*trauma;
  u.uShake.value.set((Math.random()-0.5)*s*0.045,(Math.random()-0.5)*s*0.045);
  u.uFlash.value=flashAmt;
  u.uRoll.value=dblSpin;                                   // double-jump barrel roll (image-space)
  trauma=Math.max(0,trauma-dt*1.8);
  flashAmt=Math.max(0,flashAmt-dt*2.6);
}

// ---------- materials ----------
const matFill    = new THREE.MeshBasicMaterial({ color:0x000000 });
const matRed     = new THREE.MeshBasicMaterial({ color:0xff2626 });
const matWhite   = new THREE.MeshBasicMaterial({ color:0xffffff });
const matBlue    = new THREE.MeshBasicMaterial({ color:0x3a8bff });
// SUPERHOT-style crystalline red mannequin (solid, flat-shaded → facets read as a figure, not a blob)
const matMannequin = new THREE.MeshStandardMaterial({ color:0xff1414, flatShading:true, roughness:0.5, metalness:0.0, emissive:0x220000 });
// lights only affect the Standard-material mannequins; the wireframe world (MeshBasic) ignores them
scene.add(new THREE.HemisphereLight(0xffffff, 0x220000, 0.7));
const manLight = new THREE.DirectionalLight(0xffffff, 2.2); manLight.position.set(4,9,6); scene.add(manLight);
const edgeWhite  = new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.85 });
const edgeDim    = new THREE.LineBasicMaterial({ color:0x8fa2c0, transparent:true, opacity:0.35 });
const edgeRed    = new THREE.LineBasicMaterial({ color:0xff2626 });

function addEdges(mesh, mat=edgeWhite){
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), mat);
  mesh.add(e); return mesh;
}

// ============================================================
//  Environment (varied, big, wireframe)
// ============================================================
const obstacles = [];                               // {x,z,r} horizontal blockers
function blocker(x,z,r){ obstacles.push({x,z,r}); }

function solid(geo,x,y,z,{rx=0,ry=0,rz=0,edge=edgeWhite}={}){
  const m = new THREE.Mesh(geo, matFill);
  m.position.set(x,y,z); m.rotation.set(rx,ry,rz);
  addEdges(m, edge); scene.add(m); return m;
}
const boxG = (w,h,d)=>new THREE.BoxGeometry(w,h,d);
const cylG = (r,h,s=10)=>new THREE.CylinderGeometry(r,r,h,s);

// floor grid — big enough for the huge playfield
const grid = new THREE.GridHelper(200, 100, 0xffffff, 0xffffff);
grid.material.transparent = true; grid.material.opacity = 0.2;
scene.add(grid);
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(280,280), matFill)
  .rotateX(-PI/2)); // black floor so grid reads crisp (mesh under grid)

// ---------- asset loading gate ----------
const gltfLoader = new GLTFLoader();
const jobs = [];
const startBtn = document.getElementById('start');
startBtn.disabled = true; startBtn.textContent = 'Загрузка карты…';
function loadGLB(url, setup){ jobs.push(gltfLoader.loadAsync(url).then(setup).catch(e=>console.error('load fail',url,e))); }

// play bounds — circular arena, set by the map
let boundR = ARENA-4, mapScale = 1, mapObj = null;
const rc = new THREE.Raycaster();
function clampToArena(x, z, margin=0.6){
  const d = Math.hypot(x,z), m = boundR-margin;
  if(d>m){ const k=m/d; return [x*k, z*k]; }
  return [x, z];
}

// ---------- hand-designed arena (symmetric, readable: centre landmark, lanes, cover, skyline) ----------
const mapFill = new THREE.MeshBasicMaterial({ color:0x000000, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1 });
const arenaSolids = new THREE.Group(); scene.add(arenaSolids); mapObj = arenaSolids;
function aSolid(geo,x,y,z,ry=0){
  const m=new THREE.Mesh(geo, mapFill); m.position.set(x,y,z); m.rotation.y=ry;
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo,18), edgeWhite));
  arenaSolids.add(m); return m;
}
const ARENA_R = 68;                    // huge open playfield for vertical/parkour gameplay
boundR = ARENA_R;

// ---- solid platforms with AABB collision: stand on top, blocked by sides → real parkour ----
const platforms = [];                  // {minX,maxX,minZ,maxZ,top,bottom}
function platform(cx,cz,w,d,top,h=null){
  h = (h==null) ? top+1.2 : h;         // default: solid down to the ground; pass small h for a floating slab
  const geo=new THREE.BoxGeometry(w,h,d);
  const m=new THREE.Mesh(geo, mapFill); m.position.set(cx, top-h/2, cz);
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo,18), edgeWhite));
  arenaSolids.add(m);
  platforms.push({minX:cx-w/2,maxX:cx+w/2,minZ:cz-d/2,maxZ:cz+d/2,top,bottom:top-h});
  return m;
}
// highest surface you can stand on at (x,z) given your feet height
function groundAt(x,z,feetY){
  let g=0;
  for(const pl of platforms){ if(x>pl.minX&&x<pl.maxX&&z>pl.minZ&&z<pl.maxZ && pl.top<=feetY+0.12 && pl.top>g) g=pl.top; }
  return g;
}
// push (nx,nz) out of any solid block whose side you're inside (walk-under floating slabs freely)
function resolvePlatforms(nx,nz,feetY){
  for(const pl of platforms){
    if(nx>pl.minX&&nx<pl.maxX&&nz>pl.minZ&&nz<pl.maxZ && feetY<pl.top-0.25 && feetY>pl.bottom-0.3){
      const dl=nx-pl.minX, dr=pl.maxX-nx, db=nz-pl.minZ, df=pl.maxZ-nz, m=Math.min(dl,dr,db,df);
      if(m===dl) nx=pl.minX-0.02; else if(m===dr) nx=pl.maxX+0.02; else if(m===db) nz=pl.minZ-0.02; else nz=pl.maxZ+0.02;
    }
  }
  return [nx,nz];
}
// MANTLE: nearest climbable ledge just ahead & above the feet (auto pull-up onto it)
const MANTLE_REACH=1.8;
function ledgeInFront(x,z,feetY,dirx,dirz){
  const px=x+dirx*0.8, pz=z+dirz*0.8;   // sample a point just ahead of the player
  let best=null;
  for(const pl of platforms){
    if(px>pl.minX&&px<pl.maxX&&pz>pl.minZ&&pz<pl.maxZ && pl.top>feetY+0.15 && pl.top<feetY+MANTLE_REACH){
      if(best==null || pl.top<best) best=pl.top;   // grab the lowest reachable ledge
    }
  }
  return best;
}

// ===== the playground =====
// central climbable ziggurat (steps to a high perch)
[[18,0.0],[13,1.5],[9,3.0],[6,4.5],[3.5,6.0]].forEach(([s,top])=> platform(0,0,s,s,top));
// ring of towers, varied heights (cover + high perches)
for(let i=0;i<12;i++){ const a=i/12*PI*2, R=26+(i%3)*7, top=3+(i%4)*1.7;
  platform(Math.cos(a)*R, Math.sin(a)*R, 5, 5, top); }
// scattered floating parkour slabs between everything (reachable by single/double jump)
for(let i=0;i<30;i++){ const a=rand(0,PI*2), R=rand(9,ARENA_R-6), top=rand(1.5,8);
  platform(Math.cos(a)*R, Math.sin(a)*R, rand(2.8,4.6), rand(2.8,4.6), top, 0.6); }
// two big high landmarks at the far ends, climbable via nearby steps
platform( ARENA_R-16, 0, 9, 9, 11); platform(-(ARENA_R-16), 0, 9, 9, 11);
platform( ARENA_R-24, 4, 4, 4, 6);  platform(-(ARENA_R-24), -4, 4, 4, 6);
// distant neon-city skyline backdrop (atmosphere only — no collision)
const skyline=new THREE.Group(); scene.add(skyline);
for(let i=0;i<56;i++){ const a=i/56*PI*2, R=rand(100,180), h=rand(24,80), w=rand(6,14), d=rand(6,14);
  const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mapFill);
  b.position.set(Math.cos(a)*R, h/2, Math.sin(a)*R);
  b.add(new THREE.LineSegments(new THREE.EdgesGeometry(b.geometry,18), edgeWhite));
  skyline.add(b);
}

// ---------- downloadable cyberpunk props (Quaternius, CC0) ----------
const propRaw = {};
const PROP_FILES = {
  streetlight:'streetlight_cfa09b', tvtower:'tv_tower_fc13f2', antenna:'antenna_c958f2',
  signs:'cyberpunk_signs_44299e', computer:'computer_44246b', computerL:'computer_large_ca940c',
  ac:'air_conditioner_84fe2f', acStack:'ac_stacked_8a1d40', tank:'tank_ccb419',
  turretC:'turret_cannon_5669a4', turretG:'turret_gun_730a54', teleporter:'turret_teleporter_4b1fa9',
  lootbox:'lootbox_50fd1c', pipe:'pipe_4530bc', cable:'cable_long_7ac8f7', rail:'rail_2fb652',
  support:'support_5612c0', tv:'tv_a71372', platform:'cyberpunk_platform_b7721d', drone:'robot_enemy_flying_abb31f',
};
for(const [k,f] of Object.entries(PROP_FILES))
  loadGLB(`./models/props/${f}.glb`, gltf=>{ propRaw[k]=gltf.scene; });

const PROP_SCALE = 2.6;   // absolute — props have their own units, not the map's
function propInstance(name, extra=1){
  const raw = propRaw[name]; if(!raw) return null;
  const g = raw.clone(true);
  g.scale.setScalar(PROP_SCALE*extra);
  g.traverse(o=>{ if(o.isMesh){ o.material=matFill; addEdges(o, edgeWhite); o.frustumCulled=true; } });
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g); g.position.y = -box.min.y;
  return g;
}
function place(name,x,z,{ry=0,scale=1,collide=false,r=1.4,y=0}={}){
  const g = propInstance(name,scale); if(!g) return;
  const h = new THREE.Group(); h.add(g); h.position.set(x,y,z); h.rotation.y=ry;
  scene.add(h); if(collide) blocker(x,z,r);
}
// decoration for the playground — props on platform tops + scattered across the field
function designArena(){
  // obelisk on the central ziggurat's top
  place('tvtower', 0, 0, {scale:1.5, y:6.0});
  // dress about half the platform tops with a prop so the levels feel lived-in
  const deco=['streetlight','computer','computerL','ac','antenna','turretG','tv','support'];
  platforms.forEach(pl=>{ if(pl.top<1) return;
    if(Math.random()<0.5){ const cx=(pl.minX+pl.maxX)/2, cz=(pl.minZ+pl.maxZ)/2;
      place(pick(deco), cx+rand(-1,1), cz+rand(-1,1), {ry:rand(0,PI*2), y:pl.top}); }
  });
  // ground-level scatter across the whole field
  for(let i=0;i<26;i++){ const a=rand(0,PI*2), r=rand(6,ARENA_R-4);
    place(pick(['streetlight','pipe','cable','rail','support','tank']), Math.cos(a)*r, Math.sin(a)*r, {ry:rand(0,PI*2)}); }
  // signs floating high for atmosphere
  for(let i=0;i<7;i++){ const a=rand(0,PI*2), r=rand(15,ARENA_R-10);
    place('signs', Math.cos(a)*r, Math.sin(a)*r, {y:rand(9,15), ry:rand(0,PI*2)}); }
}

// ---------- sky: rotating twinkling stars + glowing moon + drifting dust ----------
const skyGroup = new THREE.Group(); scene.add(skyGroup);
let starMat;
(function stars(){
  const n=1000, pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){ const r=rand(140,320), a=rand(0,PI*2), e=rand(0.02,1.0);
    pos[i*3]=Math.cos(a)*r*Math.cos(e); pos[i*3+1]=Math.abs(Math.sin(e))*r+8; pos[i*3+2]=Math.sin(a)*r*Math.cos(e); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  starMat=new THREE.PointsMaterial({color:0xffffff,size:1.1,transparent:true,opacity:0.6,fog:false});
  skyGroup.add(new THREE.Points(g, starMat));
})();
const moon = new THREE.Mesh(new THREE.CircleGeometry(15,48), new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.95,fog:false}));
moon.position.set(-95,90,-170); moon.lookAt(0,20,0); scene.add(moon);

// ---------- MASSIVE backdrop for scale (impress factor): giant planets + colossal mountains ----------
(function megaBackdrop(){
  const faint=(c,o)=>new THREE.MeshBasicMaterial({color:c,wireframe:true,transparent:true,opacity:o,fog:false});
  // giant ringed planet — high in the sky, clearly visible
  const p1=new THREE.Mesh(new THREE.SphereGeometry(200,32,22), faint(0xffffff,0.24));
  p1.position.set(-380,560,-1000); scene.add(p1);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(330,16,6,72), faint(0xffffff,0.18));
  ring.position.copy(p1.position); ring.rotation.set(1.2,0.4,0); scene.add(ring);
  // second planet, opposite side, high
  const p2=new THREE.Mesh(new THREE.SphereGeometry(110,28,20), faint(0x9ec6ff,0.22));
  p2.position.set(700,640,-1200); scene.add(p2);
  // colossal mountain range — bases ON the ground, peaks towering far above the skyline
  const mtn=new THREE.Group(); scene.add(mtn);
  for(let i=0;i<28;i++){ const a=i/28*PI*2 + rand(-0.04,0.04), R=rand(430,720), h=rand(320,620), base=rand(150,300);
    const m=new THREE.Mesh(new THREE.ConeGeometry(base,h,(rand(4,6)|0)), faint(0xffffff,0.14));
    m.position.set(Math.cos(a)*R, h/2, Math.sin(a)*R); m.rotation.y=rand(0,PI); mtn.add(m);
  }
})();
const SPREAD=78;
let dustGeo, dustPos, emberGeo, emberPos, emberMat;
(function dust(){
  const n=360; dustPos=new Float32Array(n*3);
  for(let i=0;i<n;i++){ dustPos[i*3]=rand(-SPREAD,SPREAD); dustPos[i*3+1]=rand(0,22); dustPos[i*3+2]=rand(-SPREAD,SPREAD); }
  dustGeo=new THREE.BufferGeometry(); dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPos,3));
  scene.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({color:0xffffff,size:0.13,transparent:true,opacity:0.22})));
})();
(function embers(){          // brighter glowing motes rising through the city
  const n=140; emberPos=new Float32Array(n*3);
  for(let i=0;i<n;i++){ emberPos[i*3]=rand(-SPREAD,SPREAD); emberPos[i*3+1]=rand(0,26); emberPos[i*3+2]=rand(-SPREAD,SPREAD); }
  emberGeo=new THREE.BufferGeometry(); emberGeo.setAttribute('position',new THREE.BufferAttribute(emberPos,3));
  emberMat=new THREE.PointsMaterial({color:0xffffff,size:0.34,transparent:true,opacity:0.6});
  scene.add(new THREE.Points(emberGeo, emberMat));
})();
function updateSky(dt){
  const t=clock.getElapsedTime();
  skyGroup.rotation.y += dt*0.006;
  if(starMat) starMat.opacity = 0.5 + 0.18*Math.sin(t*1.3);
  if(emberMat) emberMat.opacity = 0.45 + 0.2*Math.sin(t*2.0);
  for(let i=0;i<dustPos.length;i+=3){
    dustPos[i+1]+=dt*0.35; if(dustPos[i+1]>22) dustPos[i+1]=0;
    dustPos[i]+=Math.sin(t*0.3+i)*dt*0.05;
  }
  for(let i=0;i<emberPos.length;i+=3){
    emberPos[i+1]+=dt*0.8; if(emberPos[i+1]>26){ emberPos[i+1]=0; emberPos[i]=rand(-SPREAD,SPREAD); emberPos[i+2]=rand(-SPREAD,SPREAD); }
    emberPos[i]+=Math.sin(t*0.5+i)*dt*0.12;
  }
  dustGeo.attributes.position.needsUpdate=true;
  emberGeo.attributes.position.needsUpdate=true;
}

// ============================================================
//  Player + controls
// ============================================================
const controls = new PointerLockControls(camera, document.body);
scene.add(camera);
camera.position.set(0, 1.7, ARENA-10);

const keys = {};
addEventListener('keydown', e=>{ keys[e.code]=true;
  if(e.code==='KeyR') startReload();
  if(e.code==='Digit1') setWeapon('pistol');
  if(e.code==='Digit2') setWeapon('knife');
  if(e.code==='KeyQ')  setWeapon(weapon==='pistol'?'knife':'pistol');
  if(e.code==='KeyG' && inspectT<=0 && throwT<=0 && !reloading) inspectT=INSPECT_TIME;         // CS2-style inspect (both weapons)
  if(e.code==='Space' && !e.repeat){ e.preventDefault(); doJump(); }                            // jump / double jump (edge-triggered)
});
addEventListener('keyup',   e=>{ keys[e.code]=false; });

let health=100, kills=0, alive=false;

// ============================================================
//  Weapon (downloaded low-poly pistol) — hip / ADS / sprint / reload
// ============================================================
const MAG=12, RELOAD_TIME=1.15;
let ammo=MAG, reloading=false, reloadT=0, reloadDropped=false, ads=false, sprinting=false, recoil=0, fireCd=0;
let swayYaw=0, swayPitch=0, prevCamY=0, prevCamX=0, breathe=0;
let recoilYaw=0, recoilRoll=0, recoilPitch=1, shotCount=0;

const gunHolder = new THREE.Group();          // parent, drives pose
const gunModel  = new THREE.Group();          // holds the mesh, drives model orientation
gunHolder.add(gunModel);
camera.add(gunHolder);
const muzzle = new THREE.Object3D(); gunHolder.add(muzzle);
const flash = new THREE.Mesh(new THREE.SphereGeometry(0.11,6,6), new THREE.MeshBasicMaterial({color:0xffffff}));
flash.scale.setScalar(0.001); muzzle.add(flash);

// poses in camera-local space {p:[x,y,z], r:[x,y,z]}
const POSE = {
  hip:    { p:[0.34,-0.36,-0.66], r:[0.0, 0.05, 0.0] },
  ads:    { p:[0.00,-0.17,-0.40], r:[0.0, 0.0,  0.0] },
  sprint: { p:[0.34,-0.40,-0.55], r:[0.35,0.55,-0.30] },
  reload: { p:[0.30,-0.46,-0.55], r:[0.75,0.20, 0.10] },
};

loadGLB('./models/pistol.glb', gltf=>{
  const m = gltf.scene;
  m.traverse(o=>{ if(o.isMesh){ o.material=matFill; addEdges(o, edgeWhite); o.frustumCulled=false; } });
  // normalize size + orient barrel toward -Z
  const box=new THREE.Box3().setFromObject(m); const size=new THREE.Vector3(); box.getSize(size);
  const s=0.34/Math.max(size.x,size.y,size.z); m.scale.setScalar(s);   // smaller viewmodel — doesn't cover the fast-paced view
  const c=box.getCenter(new THREE.Vector3()).multiplyScalar(s);
  m.position.sub(c);
  // longest axis -> forward(Z)
  if(size.x>size.z) gunModel.rotation.y = PI/2;
  gunModel.add(m);
  muzzle.position.set(0, 0.02, -0.34);
});

// ============================================================
//  Weapon 2: throwing knives (downloaded low-poly K-Bar)
// ============================================================
let weapon='knife';
const KNIFE_LEN=0.6, THROW_TIME=0.3, INSPECT_TIME=1.0;
const knifeHolder=new THREE.Group(); camera.add(knifeHolder); knifeHolder.visible=false;
let knifeProto=null, knifeView=null, throwCd=0, throwT=0, throwSide=1, inspectT=0;
const knives=[];

loadGLB('./models/knife_kabar.glb', gltf=>{
  const m=gltf.scene;
  m.traverse(o=>{ if(o.isMesh){ o.material=matFill; addEdges(o, edgeWhite); o.frustumCulled=false; } });
  const box=new THREE.Box3().setFromObject(m); const size=new THREE.Vector3(); box.getSize(size);
  const s=KNIFE_LEN/Math.max(size.x,size.y,size.z); m.scale.setScalar(s);
  const c=box.getCenter(new THREE.Vector3()).multiplyScalar(s); m.position.sub(c);
  const sz=[size.x*s,size.y*s,size.z*s], L=sz.indexOf(Math.max(...sz));
  if(L===0) m.rotation.y=PI/2; else if(L===1) m.rotation.x=-PI/2;   // longest axis (blade) -> Z
  const proto=new THREE.Group(); proto.add(m); knifeProto=proto;
  knifeView=proto.clone(true); knifeHolder.add(knifeView);          // in-hand view model (twirls when idle)
});

function setWeapon(name){
  weapon=name;
  gunHolder.visible=(name==='pistol'); knifeHolder.visible=(name==='knife');
  updateAmmoHUD();
}
function throwKnife(){
  if(!alive || throwCd>0 || !knifeProto || sprinting) return;
  throwCd=0.34; throwT=THROW_TIME; throwSide=-throwSide;             // alternate right/left swing
  addShake(0.03); fovKick=Math.min(fovKick+0.5,4);
  const O=new THREE.Vector3(); camera.getWorldPosition(O);
  const D=new THREE.Vector3(); camera.getWorldDirection(D);
  const k=knifeProto.clone(true);
  k.position.copy(O).addScaledVector(D,0.6).addScaledVector(right,throwSide*0.12).y-=0.08;
  k.userData={ vel:D.clone().multiplyScalar(32), spin:0, state:'flying', life:6, prev:k.position.clone() };
  scene.add(k); knives.push(k);
}
function stickKnife(k, dir){
  const u=k.userData; u.state='stuck'; u.stuckT=1.8; u.life=2.8;
  k.lookAt(k.position.clone().add(dir));                            // freeze blade pointing into the surface
  addShake(0.015);
}
function updateKnives(dt){
  const up=new THREE.Vector3(0,1,0);
  for(let i=knives.length-1;i>=0;i--){
    const k=knives[i], u=k.userData;
    if(u.state==='flying'){
      u.prev.copy(k.position);
      u.vel.y -= 8*dt;
      k.position.addScaledVector(u.vel, dt);
      u.spin += 26*dt;
      k.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), u.vel.clone().normalize()); // face travel
      k.rotateX(u.spin);                                            // end-over-end flip
      // enemy contact
      let hitG=null;
      for(const g of enemies){ if(g.userData.dead) continue;
        const dx=g.position.x-k.position.x, dz=g.position.z-k.position.z;
        const cy=g.position.y + (g.userData.flying?0:(g.userData.robot?2.8:1.1));   // height-aware
        if(dx*dx+dz*dz < (g.userData.bodyR+0.35)**2 && Math.abs(k.position.y-cy) < (g.userData.robot?2.7:1.3)){ hitG=g; break; } }
      if(hitG){ hitEnemy(hitG,2); spawnSparks(k.position.clone(), 9, hitG.userData.robot?matBlue:matRed);
        u.state='falling'; u.vel.set(u.vel.x*0.2, 0.6, u.vel.z*0.2); u.life=1.3;   // knife drops & fades — never hangs in the air
        continue; }
      // wall contact
      const moved=u.prev.distanceTo(k.position);
      if(mapObj){ rc.set(u.prev, u.vel.clone().normalize());
        const h=rc.intersectObject(mapObj,true).find(x=>x.object.isMesh);
        if(h && h.distance<=moved+0.15){ k.position.copy(h.point); spawnSparks(h.point,6,matWhite); stickKnife(k, u.vel.clone().normalize()); continue; } }
      // ground contact
      if(k.position.y<0.06){ k.position.y=0.06; stickKnife(k, new THREE.Vector3(u.vel.x,-1,u.vel.z).normalize()); continue; }
      u.life-=dt; if(u.life<=0){ scene.remove(k); knives.splice(i,1); }
    } else if(u.state==='stuck'){
      u.stuckT-=dt;
      if(u.stuckT<=0){ u.state='falling'; u.vel.set(rand(-0.4,0.4),0.2,rand(-0.4,0.4)); }  // let go → drop
    } else { // falling — physics until it lands, then fade out
      u.vel.y-=15*dt; k.position.addScaledVector(u.vel,dt);
      k.rotateOnAxis(up, 5*dt);
      if(k.position.y<0.06){ k.position.y=0.06; u.vel.set(u.vel.x*0.4,0,u.vel.z*0.4); }
      u.life-=dt;
      if(u.life<0.6){ const s=Math.max(0.001,u.life/0.6); k.scale.setScalar(s); }
      if(u.life<=0){ scene.remove(k); knives.splice(i,1); }
    }
  }
}
function updateKnifeView(dt){
  const dY=camera.rotation.y-prevCamY, dX=camera.rotation.x-prevCamX; prevCamY=camera.rotation.y; prevCamX=camera.rotation.x;
  swayYaw=damp(swayYaw, clamp(-dY*7,-0.3,0.3),0.0005,dt);
  swayPitch=damp(swayPitch, clamp(-dX*7,-0.3,0.3),0.0005,dt);
  breathe+=dt;

  // ---- hand (holder) pose ----
  let px=0.2,py=-0.2,pz=-0.5, rx=-0.35, ry=0.35, rz=0.45;          // idle: knife held in hand, blade up
  px+=Math.sin(breathe*1.6)*0.005+swayYaw*0.15;
  py+=Math.cos(breathe*1.3)*0.005+swayPitch*0.12 + clamp(-velY*0.006,-0.05,0.05);   // jump inertia
  if(throwT>0){                                                     // smooth sweep across — alternates side each throw
    const p=1-throwT/THROW_TIME, arc=Math.sin(p*PI);
    const fwd=Math.sin(Math.min(p*1.35,1)*PI*0.5);                  // eased forward thrust
    px += throwSide*0.34*(1-p*p);                                   // wide wind-up on throwSide, ease to centre
    py += arc*0.10 - p*0.04;
    pz += -fwd*0.34;                                                // thrust forward
    ry += throwSide*(1.15*(1-p) - 0.3);                             // horizontal sweep across
    rz += -throwSide*arc*1.0;                                       // roll into the swing
    rx += arc*0.7;
  } else if(inspectT>0){                                            // raise & centre the knife to show it off
    const q=Math.sin((1-inspectT/INSPECT_TIME)*PI);
    px=lerp(px,-0.02,q); py=lerp(py,0.02,q); pz=lerp(pz,-0.4,q);
    rx=lerp(rx,0,q); ry=lerp(ry,0,q); rz=lerp(rz,0,q);
  }
  knifeHolder.position.set(
    damp(knifeHolder.position.x,px,0.00006,dt),
    damp(knifeHolder.position.y,py,0.00006,dt),
    damp(knifeHolder.position.z,pz,0.00006,dt));
  knifeHolder.rotation.set(
    damp(knifeHolder.rotation.x,rx,0.00006,dt),
    damp(knifeHolder.rotation.y,ry,0.00006,dt),
    damp(knifeHolder.rotation.z,rz,0.00006,dt));

  // ---- knife model spin ----
  if(knifeView){
    if(throwT>0){                                                  // one crisp flip as the knife is released
      const p=1-throwT/THROW_TIME;
      knifeView.rotation.x = p*p*(3-2*p)*PI*2;
      knifeView.rotation.y = damp(knifeView.rotation.y,0,0.0001,dt);
      knifeView.rotation.z = damp(knifeView.rotation.z,0,0.0001,dt);
    } else if(inspectT>0){                                          // CS2-style inspect: showy multi-flip twirl
      const p=1-inspectT/INSPECT_TIME, e=p*p*(3-2*p);               // smoothstep timing
      knifeView.rotation.x = e*PI*2*3;                              // 3 full end-over-end flips
      knifeView.rotation.y = Math.sin(p*PI)*PI;                     // twirl out and back
      knifeView.rotation.z = Math.sin(p*PI*2)*0.55;
    } else {                                                        // cool idle: a flip every ~2.2s + lazy twirl
      const cyc=breathe%2.2;
      knifeView.rotation.x = cyc<0.55 ? (1-Math.cos((cyc/0.55)*PI))/2 * PI*2 : 0;
      knifeView.rotation.y = damp(knifeView.rotation.y,0,0.001,dt);
      knifeView.rotation.z = Math.sin(breathe*2.4)*0.13;
    }
  }
  fovKick=damp(fovKick,0,0.0001,dt);
  camera.fov=damp(camera.fov,(sprinting?90:baseFov)+fovKick,0.0005,dt); camera.updateProjectionMatrix();
}

function startReload(){
  if(reloading || ammo>=MAG || !alive) return;
  reloading=true; reloadT=RELOAD_TIME; reloadDropped=false;
}
function dropMag(){
  const m=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.15,0.09), matFill); addEdges(m, edgeWhite);
  const wp=new THREE.Vector3(); gunHolder.getWorldPosition(wp); m.position.copy(wp);
  m.userData={ v:new THREE.Vector3(rand(-0.6,0.6), 0.6, rand(-0.6,0.6)).add(velocity.clone().multiplyScalar(0.02)),
    av:new THREE.Vector3(rand(-8,8),rand(-8,8),rand(-8,8)), life:1.4 };
  scene.add(m); fragments.push(m);
}
function fire(){
  if(!alive) return;
  if(weapon==='knife'){ throwKnife(); return; }
  if(reloading || fireCd>0 || sprinting) return;
  if(ammo<=0){ startReload(); return; }
  ammo--; fireCd=0.16; recoil=1;
  shotCount++; recoilPitch=rand(0.8,1.25); recoilYaw=(shotCount%2?1:-1)*rand(0.4,0.9); recoilRoll=rand(-1,1);  // varied recoil each shot
  flash.scale.set(rand(0.9,1.4),rand(0.9,1.4),rand(0.9,1.4)); flash.rotation.z=rand(0,PI);
  addShake(0.06); addFlash(0.05); fovKick=Math.min(fovKick+1.6,5);
  updateAmmoHUD();

  const O=new THREE.Vector3(); camera.getWorldPosition(O);
  const D=new THREE.Vector3(); camera.getWorldDirection(D);
  const spread = ads?0.0:0.012; D.x+=rand(-spread,spread); D.y+=rand(-spread,spread); D.normalize();
  let best=null,bestT=Infinity,bestKind=null,bestPoint=null;
  const tmp=new THREE.Vector3(),cl=new THREE.Vector3(),wp=new THREE.Vector3();
  for(const g of enemies){
    const u=g.userData; if(u.dead) continue;
    let et=Infinity, kind=null, pt=null;
    if(u.weakPoints){                                    // robot: only weak points damage
      for(const m of u.weakPoints){
        m.getWorldPosition(wp);
        const t=tmp.copy(wp).sub(O).dot(D); if(t<=0||t>=et) continue;
        cl.copy(O).addScaledVector(D,t);
        if(cl.distanceTo(wp)<u.weakR){ et=t; kind='weak'; pt=cl.clone(); }
      }
      if(!kind){                                         // hit the body but not a weak point → deflect
        tmp.set(g.position.x,g.position.y+u.bodyY,g.position.z);
        const t=tmp.clone().sub(O).dot(D);
        if(t>0){ cl.copy(O).addScaledVector(D,t); if(cl.distanceTo(tmp)<u.bodyR){ et=t; kind='body'; pt=cl.clone(); } }
      }
    } else {                                             // grunt / flyer: body kill anywhere
      tmp.set(g.position.x,g.position.y+u.bodyY,g.position.z);
      const t=tmp.clone().sub(O).dot(D);
      if(t>0){ cl.copy(O).addScaledVector(D,t); if(cl.distanceTo(tmp)<u.bodyR){ et=t; kind='soldier'; pt=cl.clone(); } }
    }
    if(kind && et<bestT){ best=g; bestT=et; bestKind=kind; bestPoint=pt; }
  }
  // nearest wall along the shot
  let wallT=Infinity, wallPoint=null;
  if(mapObj){ rc.set(O,D); const h=rc.intersectObject(mapObj,true).find(x=>x.object.isMesh); if(h){ wallT=h.distance; wallPoint=h.point; } }
  let hitPoint;
  if(best && bestT<wallT){
    hitPoint=bestPoint;
    if(bestKind==='body'){ spawnSparks(hitPoint,6,matBlue); addShake(0.02); }   // deflected — no damage
    else { hitEnemy(best); spawnSparks(hitPoint,12,matRed); }                    // weak point / grunt → damage
  }
  else if(wallPoint){ hitPoint=wallPoint.clone(); spawnSparks(hitPoint,8,matWhite); }
  else { hitPoint=O.clone().addScaledVector(D,80); }
  tracer(hitPoint);
  if(ammo<=0) startReload();
}
addEventListener('mousedown', e=>{ if(e.button===0) fire(); if(e.button===2) ads=true; });
addEventListener('mouseup',   e=>{ if(e.button===2) ads=false; });
addEventListener('contextmenu', e=>e.preventDefault());

function updateWeapon(dt){
  if(weapon==='knife'){ updateKnifeView(dt); return; }
  if(reloading){ reloadT-=dt; if(reloadT<=0){ reloading=false; ammo=MAG; updateAmmoHUD(); } }

  const spd=velocity.length(), t=clock.getElapsedTime();
  // weapon sway/lag from mouse look
  const dY=camera.rotation.y-prevCamY, dX=camera.rotation.x-prevCamX; prevCamY=camera.rotation.y; prevCamX=camera.rotation.x;
  swayYaw   = damp(swayYaw,   clamp(-dY*7,-0.3,0.3), 0.0005, dt);
  swayPitch = damp(swayPitch, clamp(-dX*7,-0.3,0.3), 0.0005, dt);
  breathe += dt;

  let px,py,pz,rx,ry,rz;
  if(reloading){
    const p=1-reloadT/RELOAD_TIME, dip=Math.sin(clamp(p,0,1)*PI);   // 0..1..0
    px=0.30;  py=-0.30-dip*0.24;  pz=-0.55-dip*0.05;
    rx=0.15+dip*0.85;  ry=0.05-dip*0.6;  rz=dip*0.45;
    if(!reloadDropped && p>0.2){ reloadDropped=true; dropMag(); }   // eject magazine
  } else if(inspectT>0){                                            // CS2-style inspect: quick turn, kept low
    const pr=1-inspectT/INSPECT_TIME, q=Math.sin(pr*PI);
    px=lerp(POSE.hip.p[0],0.12,q); py=lerp(POSE.hip.p[1],-0.2,q); pz=lerp(POSE.hip.p[2],-0.45,q);   // stays lower
    rx=lerp(POSE.hip.r[0],-0.2,q) + Math.sin(pr*PI*2)*0.2*q;
    ry=lerp(POSE.hip.r[1], Math.sin(pr*PI*3)*1.6, q);             // rotate to show both sides
    rz=lerp(POSE.hip.r[2], 0.4, q);
  } else {
    const pose = ads?POSE.ads : sprinting?POSE.sprint : POSE.hip;
    const bobX=(!ads&&!sprinting)?Math.sin(t*10)*spd*0.0016:0;
    const bobY=(!ads&&!sprinting)?Math.abs(Math.sin(t*10))*spd*0.0016:0;
    // livelier idle: gentle figure-8 breathing + slow roll
    const brX=Math.sin(breathe*1.2)*0.006, brY=Math.sin(breathe*2.4)*0.004, brR=Math.sin(breathe*0.8)*0.02;
    px=pose.p[0]+bobX+brX+swayYaw*0.15 + recoil*0.05*recoilYaw;    // whip sideways too
    py=pose.p[1]+bobY+brY - recoil*0.06 + swayPitch*0.12 + clamp(-velY*0.006,-0.05,0.05);  // jump inertia
    pz=pose.p[2]-recoil*0.03;                                      // push back — NEVER toward the camera
    rx=pose.r[0]-recoil*0.30*recoilPitch+swayPitch;                // stronger up kick
    ry=pose.r[1]+swayYaw + recoil*0.5*recoilYaw;                   // strong twist to a varied side each shot
    rz=pose.r[2]+swayYaw*0.6 + brR + recoil*0.6*recoilRoll;        // strong varied roll twist
  }
  gunHolder.position.x=damp(gunHolder.position.x,px,0.0001,dt);
  gunHolder.position.y=damp(gunHolder.position.y,py,0.0001,dt);
  gunHolder.position.z=damp(gunHolder.position.z,pz,0.0001,dt);
  gunHolder.rotation.x=damp(gunHolder.rotation.x,rx,0.0001,dt);
  gunHolder.rotation.y=damp(gunHolder.rotation.y,ry,0.0001,dt);
  gunHolder.rotation.z=damp(gunHolder.rotation.z,rz,0.0001,dt);
  recoil=damp(recoil,0,0.0001,dt);
  flash.scale.setScalar(lerp(flash.scale.x,0.001,1-Math.pow(0.0001,dt)));
  flash.rotation.z+=dt*22;

  fovKick=damp(fovKick,0,0.0001,dt);
  const targetFov=(ads?55:sprinting?90:baseFov)+fovKick;
  camera.fov=damp(camera.fov,targetFov,0.0005,dt); camera.updateProjectionMatrix();
}

// ============================================================
//  Enemies (downloaded low-poly RobotExpressive, animated)
// ============================================================
const enemies = [];
const ENEMY_YAW_OFFSET = 0;            // tweak if the model faces the wrong way
const enemyTypes = [];                  // mix of humanoid + robot, chosen per spawn

function loadEnemyType(url, animMap, opts={}){
  loadGLB(url, gltf=>{
    scene.add(gltf.scene); gltf.scene.updateMatrixWorld(true);   // resolve skinned-mesh bounds
    const box=new THREE.Box3().setFromObject(gltf.scene, true);
    scene.remove(gltf.scene);
    enemyTypes.push({ scene:gltf.scene, anims:gltf.animations, scale:1.85/(box.max.y-box.min.y), minY:box.min.y, animMap, ...opts });
  });
}
loadEnemyType('./models/CesiumMan.glb',        {idle:'x', walk:'x', run:'x'});   // plain humanoid → rendered as a solid red mannequin
loadEnemyType('./models/RobotExpressive.glb',  {idle:'Idle', walk:'Walking', run:'Running', punch:'Punch', death:'Death'}, {robot:true}); // blue giant w/ weak points

function setAnim(u, name, fade=0.22){
  if(u.current===name || !u.actions[name]) return;
  const next=u.actions[name], prev=u.actions[u.current];
  next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
  if(prev) next.crossFadeFrom(prev, fade, false);
  u.current=name;
}
const weakGeo=new THREE.SphereGeometry(1,12,12);   // unit sphere, scaled per marker
function makeEnemy(x,z){
  const g=new THREE.Group();
  let mixer=null, actions={};
  const T = enemyTypes.length ? pick(enemyTypes) : null;
  const isRobot = !!(T && T.robot);
  let weakPoints=null;
  if(T){
    const sizeMul = isRobot ? 3 : 1;                          // robots are 3× giants
    const s = T.scale*sizeMul;
    const model=cloneSkeleton(T.scene);
    model.scale.setScalar(s);
    model.position.y = -T.minY*s;
    // robots = blue wireframe giants; grunts = solid flat-shaded red mannequins (SUPERHOT look)
    model.traverse(o=>{ if(o.isMesh){ o.material = isRobot ? new THREE.MeshBasicMaterial({color:0x3a8bff,wireframe:true}) : matMannequin; o.frustumCulled=false; } });
    g.add(model);
    mixer=new THREE.AnimationMixer(model);
    for(const [k,n] of Object.entries(T.animMap)){
      const c=THREE.AnimationClip.findByName(T.anims,n) || T.anims[0];   // fallback: use the model's only clip
      if(c){ const a=mixer.clipAction(c); if(k==='punch'||k==='death'){ a.setLoop(THREE.LoopOnce); a.clampWhenFinished=true; } actions[k]=a; }
    }
    if(isRobot){
      // red weak points — the ONLY way to damage a robot (head + chest)
      const H = 1.85*sizeMul;                                 // robot height ≈ 5.5
      weakPoints=[];
      for(const wy of [H*0.9, H*0.62]){
        const m=new THREE.Mesh(weakGeo, new THREE.MeshBasicMaterial({color:0xff1010}));
        m.scale.setScalar(0.42); m.position.set(0,wy,0.15); g.add(m); weakPoints.push(m);
      }
    }
  } else {
    const b=new THREE.Mesh(boxG(0.5,1.7,0.35),matFill); b.position.y=0.9; addEdges(b,edgeRed); g.add(b);
  }
  g.position.set(x,0,z);
  g.userData={ hp: isRobot?3:2, dead:false, mixer, actions, current:null, robot:isRobot,
    weakPoints, weakR: isRobot?0.7:0, bodyY: isRobot?2.8:1.05, bodyR: isRobot?1.3:0.6,
    yaw: (T&&T.yaw)||0,
    type: Math.random()<0.5?'melee':'ranged',
    shootCd:rand(1.2,2.6), attackCd:0, dieT:0 };
  setAnim(g.userData,'idle');
  scene.add(g); enemies.push(g);
  return g;
}
// flying drone enemy (hovers, chases in 3D, shoots down at the player)
function makeFlyer(x,z){
  const g=new THREE.Group();
  const raw=propRaw['drone'];
  if(raw){ const model=raw.clone(true); model.scale.setScalar(PROP_SCALE*1.15);
    model.traverse(o=>{ if(o.isMesh){ o.material=new THREE.MeshBasicMaterial({color:0xff2626,wireframe:true}); o.frustumCulled=false; } });
    g.add(model); }
  else { const b=new THREE.Mesh(new THREE.OctahedronGeometry(0.8),matFill); addEdges(b,edgeRed); g.add(b); }
  g.position.set(x, rand(5,9), z);
  g.userData={ hp:2, dead:false, flying:true, robot:false, bob:rand(0,PI*2),
    shootCd:rand(1,2.6), bodyR:1.0, bodyY:0, weakPoints:null, weakR:0, velY:0,
    mixer:null, actions:{}, current:null, yaw:0, type:'ranged' };
  scene.add(g); enemies.push(g);
  return g;
}
function spawnWave(n){
  for(let i=0;i<n;i++){
    let x,z,tries=0;
    do{ const a=rand(0,PI*2), r=rand(12,boundR-4); x=Math.cos(a)*r; z=Math.sin(a)*r; tries++; }
    while(tries<25 && Math.hypot(x-camera.position.x,z-camera.position.z)<18);
    if(Math.random()<0.3) makeFlyer(x,z); else makeEnemy(x,z);   // ~30% flyers
  }
}
function hitEnemy(g, dmg=1){
  if(g.userData.dead) return;
  g.userData.hp-=dmg; flashHit(); addShake(0.04);
  if(g.userData.hp<=0) killEnemy(g);
}
function killEnemy(g){
  g.userData.dead=true;
  const c=new THREE.Vector3(); g.getWorldPosition(c);
  if(g.userData.robot){                      // blue explosion + a few falling chunks (toned down)
    c.y=g.position.y+2.8;
    explode(c, 1.7, 0x3a8bff, [matBlue, matWhite]);
    explodeChunks(c, matBlue, 16, 2.3);
    spawnSparks(c, 10, matBlue);
    hitstop=0.07;
  } else {                                   // grunt / flyer: red burst + shards + sparks
    c.y=g.position.y+(g.userData.flying?0:1.0); explode(c, 1.25, 0xff2626, [matRed, matWhite]); shatter(g);
    spawnSparks(c, 16, matRed);
    hitstop=0.05;
  }
  scene.remove(g);
  const i=enemies.indexOf(g); if(i>=0) enemies.splice(i,1);
  kills++; document.getElementById('kills').textContent=kills;
}

function updateEnemies(dt){
  const pp=camera.position;
  for(let i=enemies.length-1;i>=0;i--){
    const g=enemies[i], u=g.userData;
    if(u.mixer) u.mixer.update(dt);
    if(u.weakPoints){ const p=0.42*(1+0.28*Math.sin(clock.getElapsedTime()*6)); u.weakPoints.forEach(m=>m.scale.setScalar(p)); }
    if(u.dead){ continue; }                                 // removed instantly on kill (see killEnemy)
    const dx=pp.x-g.position.x, dz=pp.z-g.position.z, dist=Math.hypot(dx,dz);
    g.rotation.y = Math.atan2(dx,dz)+ENEMY_YAW_OFFSET+u.yaw;

    if(u.flying){                                           // ---- flying drone ----
      u.bob += dt*2.2;
      if(dist>9){ g.position.x += dx/dist*3.4*dt; g.position.z += dz/dist*3.4*dt; }
      const targetY = pp.y + 2.6;                           // hover above the player
      g.position.y += (targetY - g.position.y)*Math.min(1,1.6*dt) + Math.sin(u.bob)*0.012;
      u.shootCd -= dt;
      if(u.shootCd<=0 && dist<44){ enemyShoot(g); u.shootCd=rand(1.6,3.0); }
      continue;
    }

    // ---- ground enemy: gravity + land on platforms + jump to climb ----
    const egH=groundAt(g.position.x,g.position.z,g.position.y);
    u.velY=(u.velY||0)-GRAVITY*dt;
    let nf=g.position.y+u.velY*dt;
    if(nf<=egH){ nf=egH; u.velY=0; u.eground=true; } else u.eground=false;
    g.position.y=nf;
    const pFeet=pp.y-GROUND_Y;
    if(u.eground && dist>2 && (pFeet-g.position.y>1.0) && Math.random()<3.0*dt) u.velY=JUMP_V*0.96; // hop to reach higher player

    const want = u.type==='melee'?2.4:13;
    if(dist>want+0.6){
      const sp = dist>18?5.2:2.6;
      g.position.x += dx/dist*sp*dt; g.position.z += dz/dist*sp*dt;
      resolveEnemy(g);
      setAnim(u, dist>18?'run':'walk');
    } else {
      if(u.type==='melee'){
        u.attackCd-=dt;
        if(u.attackCd<=0){ setAnim(u,'punch',0.08); u.actions.punch&&u.actions.punch.reset().play(); u.attackCd=1.4; if(dist<3 && Math.abs(pFeet-g.position.y)<1.5) damage(11); }
        else if(u.current!=='punch') setAnim(u,'idle');
      } else {
        setAnim(u,'idle');
      }
    }
    if(u.type==='ranged'){
      u.shootCd-=dt;
      if(u.shootCd<=0 && dist<40){ enemyShoot(g); u.shootCd=rand(1.6,3.0); }
    }
  }
  muzzleLightless();
}
function resolveEnemy(g){
  for(const o of obstacles){
    const d=Math.hypot(g.position.x-o.x,g.position.z-o.z), min=o.r+0.5;
    if(d<min){ const a=Math.atan2(g.position.z-o.z,g.position.x-o.x); g.position.x=o.x+Math.cos(a)*min; g.position.z=o.z+Math.sin(a)*min; }
  }
  { const [ex,ez]=resolvePlatforms(g.position.x,g.position.z,g.position.y); g.position.x=ex; g.position.z=ez; }
  { const [ex,ez]=clampToArena(g.position.x,g.position.z,1); g.position.x=ex; g.position.z=ez; }
}
function muzzleLightless(){ /* placeholder for future muzzle dynamic light */ }

// ============================================================
//  Enemy bullets · shatter fragments · tracers
// ============================================================
const bullets=[]; const bulletGeo=new THREE.SphereGeometry(0.1,8,8);
function enemyShoot(g){
  const cy = g.userData.flying ? g.position.y : g.position.y+1.15;   // height-aware muzzle
  const from=new THREE.Vector3(g.position.x,cy,g.position.z);
  const dir=new THREE.Vector3(camera.position.x-from.x,camera.position.y-from.y,camera.position.z-from.z).normalize();
  const b=new THREE.Mesh(bulletGeo,matRed); b.position.copy(from).addScaledVector(dir,0.5);
  b.userData={v:dir.multiplyScalar(13),life:5}; scene.add(b); bullets.push(b);
}
function updateBullets(dt){
  const pp=camera.position;
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i]; b.position.addScaledVector(b.userData.v,dt); b.userData.life-=dt;
    if(Math.hypot(b.position.x-pp.x,b.position.z-pp.z)<0.5 && Math.abs(b.position.y-1.4)<1){ damage(14); scene.remove(b); bullets.splice(i,1); continue; }
    if(b.userData.life<=0){ scene.remove(b); bullets.splice(i,1); }
  }
}
const fragments=[]; const fragGeo=new THREE.TetrahedronGeometry(0.16);
function shatter(g){
  const c=new THREE.Vector3(); g.getWorldPosition(c);
  for(let i=0;i<30;i++){
    const f=new THREE.Mesh(fragGeo,matRed);
    f.position.set(c.x+rand(-0.3,0.3),rand(0.3,1.9),c.z+rand(-0.3,0.3));
    f.userData={v:new THREE.Vector3(rand(-4,4),rand(2,7),rand(-4,4)),av:new THREE.Vector3(rand(-9,9),rand(-9,9),rand(-9,9)),life:1.7};
    scene.add(f); fragments.push(f);
  }
}
function updateFragments(dt){
  for(let i=fragments.length-1;i>=0;i--){
    const f=fragments[i],u=f.userData; u.v.y-=15*dt; f.position.addScaledVector(u.v,dt);
    if(f.position.y<0.08){ f.position.y=0.08; u.v.y*=-0.4; u.v.x*=0.7; u.v.z*=0.7; }
    f.rotation.x+=u.av.x*dt; f.rotation.y+=u.av.y*dt; u.life-=dt;
    if(u.s0===undefined) u.s0=f.scale.x;                                   // remember initial size
    if(u.life<0.5) f.scale.setScalar(Math.max(0.001, u.s0*u.life/0.5));    // fade from own size
    if(u.life<=0){ scene.remove(f); fragments.splice(i,1); }
  }
}
// ---------- impact sparks (every shot) ----------
function spawnSparks(pos, n=8, mat=matWhite){
  for(let i=0;i<n;i++){
    const s=new THREE.Mesh(fragGeo, mat);
    s.position.copy(pos);
    s.userData={ v:new THREE.Vector3(rand(-3.5,3.5),rand(1,5.5),rand(-3.5,3.5)),
      av:new THREE.Vector3(rand(-12,12),rand(-12,12),rand(-12,12)), life:rand(0.25,0.55) };
    scene.add(s); fragments.push(s);
  }
}

// ---------- explosions (shockwave sphere + core flash + ground ring + sparks) ----------
const explosions=[];
const expWireGeo=new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1,1));
const ringGeo=new THREE.RingGeometry(0.85,1.0,40);
const chunkGeo=new THREE.IcosahedronGeometry(0.4,0);
function explode(pos, big=1, color=0xffffff, sparkMats=[matRed,matWhite]){
  const sph=new THREE.LineSegments(expWireGeo, new THREE.LineBasicMaterial({color,transparent:true,opacity:1}));
  sph.position.copy(pos); sph.scale.setScalar(0.3*big); scene.add(sph);
  explosions.push({o:sph,type:'sphere',life:0.5,max:0.5,big});
  const core=new THREE.Mesh(new THREE.SphereGeometry(0.55*big,10,10), new THREE.MeshBasicMaterial({color,transparent:true,opacity:1}));
  core.position.copy(pos); scene.add(core); explosions.push({o:core,type:'flash',life:0.16,max:0.16,big});
  const ring=new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.9,side:THREE.DoubleSide}));
  ring.rotation.x=-PI/2; ring.position.set(pos.x,0.06,pos.z); scene.add(ring);
  explosions.push({o:ring,type:'ring',life:0.55,max:0.55,big});
  // lingering slow shockwave ring (extra detail)
  const ring2=new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.5,side:THREE.DoubleSide}));
  ring2.rotation.x=-PI/2; ring2.position.set(pos.x,0.04,pos.z); scene.add(ring2);
  explosions.push({o:ring2,type:'ring',life:1.3,max:1.3,big:big*1.7});
  for(let i=0;i<28;i++){
    const s=new THREE.Mesh(fragGeo, sparkMats[i%sparkMats.length]);
    s.position.copy(pos).add(new THREE.Vector3(rand(-0.2,0.2),rand(0,1),rand(-0.2,0.2)));
    s.userData={v:new THREE.Vector3(rand(-7,7),rand(3,10),rand(-7,7)),av:new THREE.Vector3(rand(-14,14),rand(-14,14),rand(-14,14)),life:rand(0.5,1.2)};
    scene.add(s); fragments.push(s);
  }
  const d=pos.distanceTo(camera.position);
  addShake(clamp(1.4/(1+d*0.12),0.08,0.7)*big); addFlash(0.14*big);
}
// big physics debris (falls, bounces, fades) — used for the robot's giant blue death
function explodeChunks(pos, mat, n=30, sizeMax=3.4){
  for(let i=0;i<n;i++){
    const c=new THREE.Mesh(chunkGeo, mat);
    c.scale.setScalar(rand(1.2,sizeMax));
    c.position.copy(pos).add(new THREE.Vector3(rand(-1.2,1.2),rand(0,3.5),rand(-1.2,1.2)));
    c.userData={ v:new THREE.Vector3(rand(-10,10),rand(5,15),rand(-10,10)),
      av:new THREE.Vector3(rand(-9,9),rand(-9,9),rand(-9,9)), life:rand(1.8,3.4) };
    scene.add(c); fragments.push(c);
  }
}
function updateExplosions(dt){
  for(let i=explosions.length-1;i>=0;i--){
    const e=explosions[i]; e.life-=dt; const k=1-e.life/e.max;
    if(e.type==='sphere'){ e.o.scale.setScalar((0.3+k*3.6)*e.big); e.o.material.opacity=(1-k); }
    else if(e.type==='flash'){ e.o.scale.setScalar(1+k*1.6); e.o.material.opacity=(1-k); }
    else if(e.type==='ring'){ e.o.scale.setScalar((1+k*7)*e.big); e.o.material.opacity=(1-k)*0.9; }
    if(e.life<=0){ scene.remove(e.o); e.o.material.dispose(); explosions.splice(i,1); }
  }
}

const tracers=[];
function tracer(to){
  const from=new THREE.Vector3(); muzzle.getWorldPosition(from);
  const g=new THREE.BufferGeometry().setFromPoints([from,to]);
  const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.9}));
  l.userData={life:0.07}; scene.add(l); tracers.push(l);
}
function updateTracers(dt){
  for(let i=tracers.length-1;i>=0;i--){ const l=tracers[i]; l.userData.life-=dt; l.material.opacity=Math.max(0,l.userData.life/0.07); if(l.userData.life<=0){ scene.remove(l); tracers.splice(i,1); } }
}

// ============================================================
//  Movement (WASD + sprint) & collision
// ============================================================
const velocity=new THREE.Vector3(), forward=new THREE.Vector3(), right=new THREE.Vector3();
// ---- jumping / double jump ----
const GROUND_Y=1.7, JUMP_V=10.5, GRAVITY=24;   // higher jump: ~2.3m single, ~4.6m double
let velY=0, jumps=0, onGround=true, landDip=0, dblSpin=0;
function doJump(){
  if(!alive) return;
  if(onGround){ velY=JUMP_V; onGround=false; jumps=1; addShake(0.02); }
  else if(jumps<2){ velY=JUMP_V; jumps=2; addShake(0.13); fovKick=Math.min(fovKick+7,9); } // double jump → full impulse + FOV kick/shake
}
function updatePlayer(dt){
  const fwdKey = keys['KeyW'];
  sprinting = !!keys['ShiftLeft'] && fwdKey && !ads && !reloading;
  const speed = sprinting?12:7;
  const wish=new THREE.Vector3();
  camera.getWorldDirection(forward); forward.y=0; forward.normalize();
  right.crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
  if(keys['KeyW']) wish.add(forward);
  if(keys['KeyS']) wish.sub(forward);
  if(keys['KeyD']) wish.add(right);
  if(keys['KeyA']) wish.sub(right);
  if(wish.lengthSq()>0) wish.normalize().multiplyScalar(speed);
  if(onGround){                                                       // ground: snappy start/stop
    velocity.x=damp(velocity.x,wish.x,0.0001,dt); velocity.z=damp(velocity.z,wish.z,0.0001,dt);
  } else if(wish.lengthSq()>0){                                        // air: WASD only steers — momentum dominates
    velocity.x=damp(velocity.x,wish.x,0.25,dt);   velocity.z=damp(velocity.z,wish.z,0.25,dt);
  }                                                                    // air + no keys: velocity untouched → you keep sailing, never drop like a stone

  const pdt = onGround ? dt : dt*Math.max(timeScale,0.25);   // air: full speed with WASD, slow-mo float without (min 25% so you still land)
  const p=camera.position, feetY=p.y-GROUND_Y;
  let nx=p.x+velocity.x*pdt, nz=p.z+velocity.z*pdt;
  for(const o of obstacles){ const d=Math.hypot(nx-o.x,nz-o.z),min=o.r+0.5; if(d<min){ const a=Math.atan2(nz-o.z,nx-o.x); nx=o.x+Math.cos(a)*min; nz=o.z+Math.sin(a)*min; } }
  ;[nx,nz]=resolvePlatforms(nx,nz,feetY);                // platform side collision
  { const [cx,cz]=clampToArena(nx,nz,0.6); p.x=cx; p.z=cz; }

  // ---- MANTLE: while airborne & moving into a reachable ledge, pull up onto it ----
  const hspd = Math.hypot(velocity.x,velocity.z);
  if(!onGround && velY<4 && hspd>1.5){
    const ledge = ledgeInFront(p.x, p.z, feetY, velocity.x/hspd, velocity.z/hspd);
    if(ledge!=null){ velY = Math.sqrt(2*GRAVITY*(ledge-feetY+0.25)); }  // exact pop onto the ledge
  }

  // ---- vertical: jump / double jump / gravity / land on platforms (scaled by pdt → slow-mo air) ----
  const gH = groundAt(p.x, p.z, feetY);
  if(!onGround) velY -= GRAVITY*pdt;
  let nf = feetY + velY*pdt;                             // new feet height
  if(nf<=gH){ nf=gH; if(!onGround){ landDip=Math.min(1,Math.abs(velY)*0.08); addShake(0.05); } velY=0; onGround=true; jumps=0; }
  else onGround=false;                                   // walked off a ledge → falling
  p.y = nf + GROUND_Y;
  landDip = damp(landDip, 0, 0.0003, dt);
  p.y -= landDip*0.14;                                   // landing crouch dip
  dblSpin = damp(dblSpin, 0, 0.0009, dt);
}

// ============================================================
//  HUD / damage / flow
// ============================================================
const crosshair=document.getElementById('crosshair');
const hitflash=document.getElementById('hitflash');
const healthEl=document.getElementById('health');
const ammoEl=document.getElementById('ammo');
function flashHit(){ crosshair.classList.add('hit'); setTimeout(()=>crosshair.classList.remove('hit'),80); }
function damage(v){ if(!alive) return; health=Math.max(0,health-v); healthEl.style.width=health*0.28+'px'; hitflash.style.opacity=0.55; addShake(0.35); if(health<=0) gameOver(); }
function updateAmmoHUD(){
  if(weapon==='knife'){ ammoEl.innerHTML = '<b>НОЖ</b> ∞'; return; }
  ammoEl.innerHTML = reloading ? 'ПЕРЕЗАРЯДКА' : `<b>${ammo}</b> / ${MAG}`;
}
const timebar=document.getElementById('timebar');
function updateHUD(dt){
  hitflash.style.opacity=lerp(parseFloat(hitflash.style.opacity)||0,0,1-Math.pow(0.0001,dt));
  crosshair.style.transform=`translate(-50%,-50%) scale(${ads?0.5:1})`;
  crosshair.style.opacity = ads?0.9:0.7;
  timebar.style.height=(4+timeScale*96)+'%';
  if(reloading) updateAmmoHUD();
}

let waveTimer=0,waveNum=0;
function manageWaves(dt){
  waveTimer-=dt;
  if(enemies.length<3 || waveTimer<=0){ if(enemies.length<4){ waveNum++; spawnWave(Math.min(3+waveNum,8)); waveTimer=8; } }
}

function startGame(){
  enemies.slice().forEach(g=>scene.remove(g)); enemies.length=0;
  bullets.slice().forEach(b=>scene.remove(b)); bullets.length=0;
  fragments.slice().forEach(f=>scene.remove(f)); fragments.length=0;
  knives.slice().forEach(k=>scene.remove(k)); knives.length=0;
  health=100; kills=0; waveNum=0; waveTimer=0; ammo=MAG; reloading=false; ads=false; setWeapon('knife');
  camera.position.set(0, 1.7, 46); camera.rotation.set(0, 0, 0);              // south side, facing the central ziggurat
  velY=0; jumps=0; onGround=true; landDip=0; dblSpin=0;                        // reset jump state
  healthEl.style.width='28px'; document.getElementById('kills').textContent='0'; updateAmmoHUD();
  document.getElementById('over').style.display='none';
  document.getElementById('menu').style.display='none';
  alive=true; controls.lock(); spawnWave(3);
}
function gameOver(){ alive=false; controls.unlock(); document.getElementById('finalscore').textContent='убито: '+kills; document.getElementById('over').style.display='flex'; }
document.getElementById('start').addEventListener('click', startGame);
document.getElementById('restart').addEventListener('click', startGame);

// ============================================================
//  Loop
// ============================================================
const clock=new THREE.Clock();
// slow-mo time: flows only while pressing WASD (ground OR air); otherwise slowed
let timeScale = 1;
function computeTimeScale(dt){
  const wasd = keys['KeyW']||keys['KeyA']||keys['KeyS']||keys['KeyD'];
  timeScale = damp(timeScale, wasd ? 1.0 : 0.05, 0.0004, dt);
  return timeScale;
}
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.05);
  const ts = alive ? computeTimeScale(dt) : 1;
  const wdt = dt * ts * (hitstop>0 ? 0.12 : 1);  // time-scale + brief hit-stop
  if(hitstop>0) hitstop-=dt;
  if(fireCd>0) fireCd-=dt;
  if(throwCd>0) throwCd-=dt;
  if(throwT>0) throwT-=dt;
  if(inspectT>0) inspectT-=dt;
  if(alive){
    updatePlayer(dt); updateWeapon(dt); updateEnemies(wdt);  // player/weapon stay real-time
    updateBullets(wdt); updateTracers(dt); manageWaves(dt); updateHUD(dt);
  }
  updateFragments(wdt); updateExplosions(wdt); updateKnives(dt);   // knives fly real-time (player's weapon)
  updateSky(dt); updatePost(dt);
  composer.render();
}
animate();

// build the world once every asset (map + props + pistol + robot) has loaded
Promise.all(jobs).then(()=>{
  designArena();
  startBtn.disabled=false; startBtn.textContent='Играть';
});


addEventListener('resize', ()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight); composer.setSize(innerWidth,innerHeight);
  gradePass.uniforms.uRes.value.set(innerWidth,innerHeight);
});
