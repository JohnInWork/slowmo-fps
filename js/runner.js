import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

// ============================================================
//  SlowmoFPS Runner · портретный мобильный раннер
//  Мир едет на игрока, игрок стоит в нуле и меняет полосу.
// ============================================================
const PI = Math.PI;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const lerp  = (a,b,t)=>a+(b-a)*t;
const damp  = (a,b,l,dt)=>lerp(a,b,1-Math.pow(l,dt));
const rand  = (a,b)=>a+Math.random()*(b-a);
const pick  = arr=>arr[(Math.random()*arr.length)|0];

// ---------- настройки ----------
const LANES      = [-2.3, 0, 2.3];       // три полосы
const LANE_HALF  = 1.15;                 // половина ширины полосы (для столкновений)
const TILE       = 24, TILES = 9;        // длина и количество плиток пола
const START_SPEED= 15, MAX_SPEED = 36;   // м/с, разгон по ходу забега
const SPEED_RAMP = 0.30;                 // прибавка скорости в секунду
const SPAWN_Z    = -125, DESPAWN_Z = 9;
const PLAYER_Y   = 1.55;
const GRAVITY    = 44, JUMP_V = 13.4;    // прыжок ~2 м, висишь ~0.6 с
const SLOW_TS    = 0.22;                 // во сколько замедляется время
const SLOW_DRAIN = 0.5;                  // шкала на полном заряде даёт ~2 с замедления
const SLOW_TRICKLE = 0.06;               // сама почти не растёт: время добывают капсулами
const CELL_GAIN  = 0.34;
const IFRAMES    = 1.25;                 // неуязвимость после удара
const BEST_KEY   = 'slowmofps-runner-best';

// ---------- сцена ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040406);
scene.fog = new THREE.Fog(0x040406, 14, 118);   // дальняя сетка растворяется, а не слипается в белую стену

const camera = new THREE.PerspectiveCamera(80, innerWidth/innerHeight, 0.05, 2500);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.setSize(innerWidth, innerHeight);
const coarse = matchMedia('(pointer:coarse)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.75 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

// вертикальный угол считаем из горизонтального, но с потолком: иначе на портрете
// объектив уходит в рыбий глаз и трасса кажется далёкой и мелкой
function applyFov(){
  const aspect = innerWidth/innerHeight;
  camera.aspect = aspect;
  camera.fov = clamp(2*Math.atan(Math.tan(46*PI/180/2)/aspect)*180/PI, 58, 72);
  camera.updateProjectionMatrix();
}
applyFov();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.62, 0.8, 0.14);
composer.addPass(bloom);

// ---------- та же плёночная обработка, что в оригинале ----------
const gradePass = new ShaderPass({
  uniforms: {
    tDiffuse:{value:null}, uTime:{value:0}, uShake:{value:new THREE.Vector2()},
    uFlash:{value:0}, uVig:{value:1.0}, uCA:{value:1.0}, uGrain:{value:0.05},
    uScan:{value:0.045}, uSlow:{value:0}, uRes:{value:new THREE.Vector2(innerWidth,innerHeight)}
  },
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader:`
    uniform sampler2D tDiffuse; uniform float uTime,uFlash,uVig,uCA,uGrain,uScan,uSlow; uniform vec2 uShake,uRes;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 uv=vUv+uShake;
      vec2 d=uv-0.5; float r2=dot(d,d);
      vec2 off=d*(uCA*0.007*(1.0+uSlow*2.2))*(r2*2.2+0.15);   // в слоу-мо хроматика разъезжается сильнее
      vec3 col;
      col.r=texture2D(tDiffuse,uv+off).r;
      col.g=texture2D(tDiffuse,uv).g;
      col.b=texture2D(tDiffuse,uv-off).b;
      col*=1.0-(uScan+uSlow*0.05)*(0.5+0.5*sin(uv.y*uRes.y*1.7));
      float vig=smoothstep(1.15,0.28,length(d)*1.55);
      col*=mix(1.0,vig,uVig);
      col+=(hash(uv*uRes*0.6+fract(uTime))-0.5)*uGrain;
      col+=uFlash;
      gl_FragColor=vec4(col,1.0);
    }`
});
composer.addPass(gradePass);

// в портрете низ кадра далеко от центра, и та же виньетка съедает ближний пол — ослабляем.
// скан-линии считаем от реального буфера, иначе на ретине частота уходит в муар
function applyLook(){
  const portrait = innerWidth < innerHeight;
  gradePass.uniforms.uVig.value = portrait ? 0.5 : 1.0;
  // на портрете край кадра вдвое дальше от центра, и та же аберрация расщепляет
  // однопиксельную рейку на три цветные — от белой линии не остаётся ничего
  gradePass.uniforms.uCA.value  = portrait ? 0.3 : 1.0;
  const b=new THREE.Vector2(); renderer.getDrawingBufferSize(b);
  gradePass.uniforms.uRes.value.copy(b);
}
applyLook();

let trauma=0, flashAmt=0, hitstop=0;
const addShake=v=>{ trauma=Math.min(1,trauma+v); };
const addFlash=v=>{ flashAmt=Math.min(0.6,flashAmt+v); };

// ---------- материалы ----------
const matFill   = new THREE.MeshBasicMaterial({ color:0x000000 });
const matWhite  = new THREE.MeshBasicMaterial({ color:0xffffff });
const matRed    = new THREE.MeshBasicMaterial({ color:0xff2626 });
const matBlue   = new THREE.MeshBasicMaterial({ color:0x3a8bff });
const edgeWhite = new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.85 });
const edgeRed   = new THREE.LineBasicMaterial({ color:0xff2626 });
const wireBlue  = new THREE.MeshBasicMaterial({ color:0x3a8bff, wireframe:true });
// красный манекен как в оригинале: сплошной, гранёный — читается фигурой, а не пятном
const matMannequin = new THREE.MeshStandardMaterial({ color:0xff1414, flatShading:true, roughness:0.5, emissive:0x220000 });
scene.add(new THREE.HemisphereLight(0xffffff, 0x220000, 0.75));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2); keyLight.position.set(3,8,4); scene.add(keyLight);

function edged(mesh, mat=edgeWhite){
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), mat));
  return mesh;
}

// ============================================================
//  Мир: пол, столбы, небо
// ============================================================
const moving = [];                       // всё, что едет на игрока

function floorTileGeo(){
  const p=[], halfW=4.7;
  for(const x of [-3.45,-1.15,1.15,3.45]){ p.push(x,0,0, x,0,-TILE); }   // границы полос
  // рейки через метр: в ближней зоне перспектива растягивает их так, что редкая
  // сетка оставляет низ кадра пустым, а метровая даёт ощущение скорости
  for(let z=0; z>-TILE; z-=1){ p.push(-halfW,0,z, halfW,0,z); }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p,3));
  return g;
}
const tileGeo = floorTileGeo();
const floorMat = new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.9 });
for(let i=0;i<TILES;i++){
  const t=new THREE.LineSegments(tileGeo, floorMat);
  t.position.z = -i*TILE;
  scene.add(t); moving.push({o:t, loop:TILES*TILE, k:1});
}
// чёрный пол под сеткой, чтобы линии читались резко
const deck = new THREE.Mesh(new THREE.PlaneGeometry(24, TILES*TILE+40), matFill);
deck.rotation.x=-PI/2; deck.position.set(0,-0.02,-(TILES*TILE)/2+20); scene.add(deck);

// боковые столбы — главный источник ощущения скорости
const pillarGeo = new THREE.BoxGeometry(1,1,1);
for(let i=0;i<26;i++){
  const m=new THREE.Mesh(pillarGeo, matFill);
  const h=rand(3,22), w=rand(1.2,3.4);
  m.scale.set(w,h,w);
  m.position.set((i%2?1:-1)*rand(6.2,13), h/2, -i*10 - rand(0,8));
  edged(m); scene.add(m);
  moving.push({o:m, loop:260, k:1});
}
// дальний силуэт города — почти без параллакса, просто атмосфера
for(let i=0;i<34;i++){
  const h=rand(18,70), w=rand(5,13);
  const m=new THREE.Mesh(pillarGeo, matFill);
  m.scale.set(w,h,w);
  m.position.set((i%2?1:-1)*rand(26,70), h/2, -i*26 - rand(0,20));
  edged(m); scene.add(m);
  moving.push({o:m, loop:900, k:0.55});
}

// небо оставляем как в оригинале: звёзды, луна, планеты, горы
(function sky(){
  const n=700, pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){ const r=rand(160,340), a=rand(0,PI*2), e=rand(0.05,1.0);
    pos[i*3]=Math.cos(a)*r*Math.cos(e); pos[i*3+1]=Math.abs(Math.sin(e))*r+10; pos[i*3+2]=Math.sin(a)*r*Math.cos(e); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({color:0xffffff,size:1.2,transparent:true,opacity:0.6,fog:false})));

  const moon=new THREE.Mesh(new THREE.CircleGeometry(16,44),
    new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.95,fog:false}));
  moon.position.set(-70,86,-320); moon.lookAt(0,20,0); scene.add(moon);

  const faint=(c,o)=>new THREE.MeshBasicMaterial({color:c,wireframe:true,transparent:true,opacity:o,fog:false});
  const p1=new THREE.Mesh(new THREE.SphereGeometry(150,26,18), faint(0xffffff,0.22));
  p1.position.set(-260,420,-900); scene.add(p1);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(250,12,6,56), faint(0xffffff,0.16));
  ring.position.copy(p1.position); ring.rotation.set(1.2,0.4,0); scene.add(ring);
  const p2=new THREE.Mesh(new THREE.SphereGeometry(90,22,16), faint(0x9ec6ff,0.2));
  p2.position.set(430,500,-1100); scene.add(p2);
  for(let i=0;i<16;i++){
    const h=rand(260,520), base=rand(140,260);
    const m=new THREE.Mesh(new THREE.ConeGeometry(base,h,(rand(4,6)|0)), faint(0xffffff,0.13));
    m.position.set(rand(-700,700), h/2, -rand(500,900)); m.rotation.y=rand(0,PI); scene.add(m);
  }
})();

// пыль, летящая навстречу
let dustGeo, dustPos;
(function dust(){
  const n=220; dustPos=new Float32Array(n*3);
  for(let i=0;i<n;i++){ dustPos[i*3]=rand(-9,9); dustPos[i*3+1]=rand(0,14); dustPos[i*3+2]=rand(-120,6); }
  dustGeo=new THREE.BufferGeometry(); dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPos,3));
  scene.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({color:0xffffff,size:0.12,transparent:true,opacity:0.35})));
})();

// ============================================================
//  Оружие в руках
// ============================================================
const gunHolder = new THREE.Group(); camera.add(gunHolder);
const muzzle = new THREE.Object3D(); gunHolder.add(muzzle);
const flash = new THREE.Mesh(new THREE.SphereGeometry(0.1,6,6), matWhite);
flash.scale.setScalar(0.001); muzzle.add(flash);
let recoil=0;

const jobs=[];
const gltfLoader=new GLTFLoader();
const startBtn=document.getElementById('start');
startBtn.disabled=true; startBtn.textContent='Загрузка…';

jobs.push(gltfLoader.loadAsync('./models/pistol.glb').then(gltf=>{
  const m=gltf.scene;
  m.traverse(o=>{ if(o.isMesh){ o.material=matFill; edged(o); o.frustumCulled=false; } });
  const box=new THREE.Box3().setFromObject(m), size=new THREE.Vector3(); box.getSize(size);
  const s=0.19/Math.max(size.x,size.y,size.z); m.scale.setScalar(s);
  m.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(s));
  if(size.x>size.z) m.rotation.y=PI/2;
  gunHolder.add(m);
  muzzle.position.set(0,0.02,-0.3);
}).catch(e=>console.warn('пистолет не загрузился', e)));

// гигант — та же модель робота, что была в оригинале, только синим каркасом
jobs.push(gltfLoader.loadAsync('./models/RobotExpressive.glb').then(gltf=>{
  const s=gltf.scene;
  scene.add(s); s.updateMatrixWorld(true);                 // чтобы посчитались границы скина
  const box=new THREE.Box3().setFromObject(s,true);
  scene.remove(s);
  const h=Math.max(0.001, box.max.y-box.min.y), w=Math.max(0.001, box.max.x-box.min.x);
  const sy=3.8/h;
  // вширь тянем до двух полос: силуэт должен совпадать с зоной поражения, иначе
  // игрок ловит удар, считая, что проскочил мимо
  robotFit={ y:sy, x:Math.min(4.6/w, sy*2.4), minY:box.min.y };
  robotProto=s; robotAnims=gltf.animations;
}).catch(e=>console.warn('робот не загрузился', e)));

// ============================================================
//  Препятствия и враги
// ============================================================
const active = [];                       // всё живое на трассе

function makeMannequin(){
  const g=new THREE.Group();
  const box=(w,h,d)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d), matMannequin);
  const torso=box(0.6,0.84,0.32); torso.position.y=1.26;
  const head=new THREE.Mesh(new THREE.IcosahedronGeometry(0.2,0), matMannequin); head.position.y=1.85;
  const legL=box(0.19,0.84,0.21); legL.position.set(-0.15,0.42,0);
  const legR=legL.clone(); legR.position.x=0.15;
  const armL=box(0.15,0.7,0.17); armL.position.set(-0.38,1.24,0);
  const armR=armL.clone(); armR.position.x=0.38;
  g.add(torso,head,legL,legR,armL,armR);
  g.userData.limbs=[legL,legR,armL,armR];
  return g;
}
// капсула времени: не враг, столкновение безвредно — но сбитая возвращает шкалу
function makeCell(){
  const g=new THREE.Group();
  const shell=new THREE.Mesh(new THREE.OctahedronGeometry(0.55,0), wireBlue);
  const core=new THREE.Mesh(new THREE.SphereGeometry(0.18,10,10), matWhite);
  g.add(shell,core); g.userData.core=core;
  return g;
}

// гигант: перекрывает две полосы, снимается с трёх попаданий.
// три красных ядра на груди — они же индикатор оставшегося здоровья
let robotProto=null, robotAnims=null, robotFit=null;
function makeRobot(){
  const g=new THREE.Group();
  const m=cloneSkeleton(robotProto);
  m.scale.set(robotFit.x, robotFit.y, robotFit.y);
  m.position.y=-robotFit.minY*robotFit.y;
  m.traverse(o=>{ if(o.isMesh){ o.material=wireBlue; o.frustumCulled=false; } });
  g.add(m);
  const mixer=new THREE.AnimationMixer(m);
  const clip=THREE.AnimationClip.findByName(robotAnims,'Walking')||robotAnims[0];
  if(clip) mixer.clipAction(clip).play();
  const cores=[];
  for(let i=0;i<3;i++){
    const c=new THREE.Mesh(new THREE.SphereGeometry(0.21,10,10), matRed);
    c.position.set((i-1)*0.6, 2.45, 0.6);
    g.add(c); cores.push(c);
  }
  g.userData.mixer=mixer; g.userData.cores=cores;
  return g;
}
function makeBarrier(){
  const g=new THREE.Group();
  const m=new THREE.Mesh(new THREE.BoxGeometry(1.95,2.7,0.45), matFill);
  m.position.y=1.35; edged(m); g.add(m);
  return g;
}
function makeLowBar(){
  const g=new THREE.Group();
  const m=new THREE.Mesh(new THREE.BoxGeometry(1.95,0.5,0.45), matFill);
  m.position.y=0.32; edged(m, edgeRed); g.add(m);       // красное — значит перепрыгнуть
  return g;
}

function makePool(factory, n){
  const free=[];
  for(let i=0;i<n;i++){ const o=factory(); o.visible=false; scene.add(o); free.push(o); }
  return {
    take(){ const o=free.pop(); if(o) o.visible=true; return o||null; },
    put(o){ o.visible=false; free.push(o); }
  };
}
const pools = {
  mannequin: makePool(makeMannequin, 14),
  cell:      makePool(makeCell, 10),
  barrier:   makePool(makeBarrier, 10),
  low:       makePool(makeLowBar, 8),
};                                        // пул гигантов собирается после загрузки модели
const SHOOTABLE = { mannequin:true, cell:true, robot:true, barrier:false, low:false };
const HP        = { mannequin:1, cell:1, robot:3, barrier:0, low:0 };
const AIM_Y     = { mannequin:1.15, cell:0, robot:2.4 };     // куда целиться по высоте
const AIM_R     = { mannequin:1.0, cell:0.9, robot:1.8 };    // радиус попадания
const HALF_W    = { mannequin:LANE_HALF, cell:0, robot:2.3, barrier:LANE_HALF, low:LANE_HALF };

function spawn(kind, lane, z, xOverride){
  const pool=pools[kind]; if(!pool) return null;
  const o = pool.take(); if(!o) return null;
  o.position.set(xOverride!=null?xOverride:LANES[lane], kind==='cell' ? 1.7 : 0, z);
  o.rotation.set(0,0,0);
  o.userData.kind=kind; o.userData.lane=lane; o.userData.dead=false; o.userData.hp=HP[kind];
  o.userData.bob=rand(0,PI*2); o.userData.gait=rand(0,PI*2);
  if(o.userData.cores) o.userData.cores.forEach(c=>c.visible=true);
  active.push(o);
  return o;
}
function release(o){
  o.userData.dead=true;
  pools[o.userData.kind].put(o);
  const i=active.indexOf(o); if(i>=0) active.splice(i,1);
}

// раскладка препятствий: минимум одна полоса всегда проходима
let nextSpawnAt = 0;
function planSpawns(dist){
  if(dist < nextSpawnAt) return;
  const gap = clamp(26 - dist/420, 11, 26);         // чем дальше, тем плотнее
  nextSpawnAt = dist + gap;

  const freeLane = (Math.random()*3)|0;              // эта полоса остаётся пустой
  const hard = Math.min(dist/900, 1);                // 0..1 — общая злость трассы

  // гигант закрывает две полосы: проход остаётся ровно один, и в нём висит капсула
  if(pools.robot && dist > 240 && Math.random() < 0.10 + hard*0.15){
    const pair = Math.random()<0.5 ? 0 : 1;          // полосы 0-1 или 1-2
    spawn('robot', pair, SPAWN_Z, (LANES[pair]+LANES[pair+1])/2);
    spawn('cell', pair===0 ? 2 : 0, SPAWN_Z - rand(8,20));
    return;
  }
  if(Math.random() < 0.2 + hard*0.18){               // низкая перекладина через всю ширину
    for(const l of [0,1,2]) spawn('low', l, SPAWN_Z);
    if(Math.random()<0.5) spawn('cell', (Math.random()*3)|0, SPAWN_Z - rand(10,22));
    return;
  }
  for(const l of [0,1,2].filter(l=>l!==freeLane)){
    const r=Math.random();
    if(r < 0.5)       spawn('mannequin', l, SPAWN_Z + rand(-6,6));
    else if(r < 0.82) spawn('barrier', l, SPAWN_Z + rand(-6,6));
    else              spawn('low', l, SPAWN_Z + rand(-6,6));
    if(Math.random() > 0.35 + hard*0.4) break;       // на старте чаще занята одна полоса, дальше — две
  }
  if(Math.random() < 0.6) spawn('cell', freeLane, SPAWN_Z + rand(-14,14));
}

// ============================================================
//  Взрывы, искры, трассеры
// ============================================================
const fragGeo=new THREE.TetrahedronGeometry(0.15);
const fragments=[];
function sparks(pos, n, mat){
  for(let i=0;i<n;i++){
    const s=new THREE.Mesh(fragGeo, mat); s.position.copy(pos);
    s.userData={ v:new THREE.Vector3(rand(-4,4),rand(1,6),rand(-4,4)),
                 av:new THREE.Vector3(rand(-12,12),rand(-12,12),rand(-12,12)), life:rand(0.3,0.8) };
    scene.add(s); fragments.push(s);
  }
}
const explosions=[];
const expGeo=new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1,1));
function explode(pos, color, big=1){
  const sph=new THREE.LineSegments(expGeo, new THREE.LineBasicMaterial({color,transparent:true,opacity:1}));
  sph.position.copy(pos); sph.scale.setScalar(0.3*big); scene.add(sph);
  explosions.push({o:sph, life:0.45, max:0.45, big});
  addShake(0.18*big); addFlash(0.1*big);
}
const tracers=[];
function tracer(to){
  const from=new THREE.Vector3(); muzzle.getWorldPosition(from);
  const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([from,to]),
    new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.9}));
  l.userData={life:0.08}; scene.add(l); tracers.push(l);
}

// ============================================================
//  Состояние забега
// ============================================================
let alive=false, paused=false;
let lane=1, laneX=0, laneVis=0;
let jumpY=0, velY=0, onGround=true;
let speed=START_SPEED, dist=0, kills=0, hp=3, iframe=0;
let timeScale=1, slowWanted=false, fuel=1;
let best=+(localStorage.getItem(BEST_KEY)||0);

const slowBtn = document.getElementById('slowbtn');
const fuelBar = slowBtn.querySelector('.bar');
const RING = 2*PI*44;                                   // длина окружности шкалы на кнопке
const el = {
  dist:document.getElementById('dist'), kills:document.getElementById('kills'),
  hp:[...document.querySelectorAll('#hp i')],
  tap:document.getElementById('tapmark'), flash:document.getElementById('hitflash'),
  tint:document.getElementById('slowtint'), menu:document.getElementById('menu'),
  over:document.getElementById('over'), rotate:document.getElementById('rotate'),
  finaldist:document.getElementById('finaldist'), best:document.getElementById('best'),
};

function setLane(dir){
  if(!alive) return;
  const n=clamp(lane+dir,0,2);
  if(n!==lane){ lane=n; addShake(0.05); }
}
function jump(){
  if(!alive || !onGround) return;
  velY=JUMP_V; onGround=false; addShake(0.04);
}
function hurt(){
  if(!alive || iframe>0) return;
  hp--; iframe=IFRAMES;
  el.hp.forEach((p,i)=>p.classList.toggle('gone', i>=hp));
  el.flash.style.opacity=0.6; addShake(0.5); addFlash(0.18);
  if(hp<=0) gameOver();
}

// выстрел в точку экрана: по лучу ищем ближайшую мишень с запасом по радиусу
const rc=new THREE.Raycaster();
const ndc=new THREE.Vector2();
function shoot(px, py){
  if(!alive) return;
  recoil=1; addShake(0.05); addFlash(0.03);
  flash.scale.setScalar(rand(0.9,1.4)); flash.rotation.z=rand(0,PI);

  el.tap.style.left=px+'px'; el.tap.style.top=py+'px';
  el.tap.classList.remove('on'); void el.tap.offsetWidth; el.tap.classList.add('on');

  ndc.set((px/innerWidth)*2-1, -(py/innerHeight)*2+1);
  rc.setFromCamera(ndc, camera);

  let hit=null, hitT=Infinity, hitP=null;
  const c=new THREE.Vector3();
  for(const o of active){
    const k=o.userData.kind;
    if(!SHOOTABLE[k]) continue;
    c.set(o.position.x, o.position.y + AIM_Y[k], o.position.z);
    const t=c.clone().sub(rc.ray.origin).dot(rc.ray.direction);
    if(t<=0 || t>=hitT) continue;
    const closest=rc.ray.origin.clone().addScaledVector(rc.ray.direction,t);
    if(closest.distanceTo(c) < AIM_R[k] + t*0.012){ hit=o; hitT=t; hitP=c.clone(); }
  }                                                  // радиус щедрый и растёт с дальностью: палец толще пикселя
  if(!hit){ tracer(rc.ray.origin.clone().addScaledVector(rc.ray.direction, 90)); return; }

  tracer(hitP);
  const u=hit.userData;
  u.hp--;

  if(u.kind==='cell'){                               // капсула времени: возвращает шкалу
    fuel=clamp(fuel+CELL_GAIN, 0, 1);
    explode(hitP, 0xffffff, 0.7); sparks(hitP, 12, matWhite);
    slowBtn.classList.remove('gain'); void slowBtn.offsetWidth; slowBtn.classList.add('gain');
    release(hit);
  } else if(u.hp > 0){                               // гигант ещё держится — гасим одно ядро
    if(u.cores && u.cores[u.hp]) u.cores[u.hp].visible=false;
    sparks(hitP, 10, matBlue); addShake(0.07); hitstop=0.03;
  } else {
    const blue = u.kind==='robot';
    explode(hitP, blue?0x3a8bff:0xff2626, blue?1.6:0.85);
    sparks(hitP, blue?18:12, blue?matBlue:matRed);
    release(hit);
    kills++; el.kills.firstChild.textContent=kills;
    hitstop=blue?0.08:0.05;
  }
}

// ============================================================
//  Управление: свайпы, тап, зажатие
// ============================================================
const canvas=renderer.domElement;
let ptr=null;
canvas.addEventListener('pointerdown', e=>{
  if(!alive) return;
  canvas.setPointerCapture?.(e.pointerId);
  ptr={ id:e.pointerId, x:e.clientX, y:e.clientY, t:performance.now(), swiped:false };
});
canvas.addEventListener('pointermove', e=>{
  if(!ptr || e.pointerId!==ptr.id) return;
  const dx=e.clientX-ptr.x, dy=e.clientY-ptr.y;
  if(ptr.swiped) return;
  if(Math.abs(dx)>26 && Math.abs(dx)>Math.abs(dy)){ setLane(Math.sign(dx)); ptr.swiped=true; }
  else if(dy<-42 && Math.abs(dy)>Math.abs(dx)){ jump(); ptr.swiped=true; }
});
canvas.addEventListener('pointerup', e=>{
  if(!ptr || e.pointerId!==ptr.id) return;
  if(!ptr.swiped) shoot(e.clientX, e.clientY);     // касание без свайпа — выстрел
  ptr=null;
});
canvas.addEventListener('pointercancel', ()=>{ ptr=null; });

// ---------- кнопка времени: переключатель, а не «держать» — палец остаётся свободен ----------
function setSlow(on){
  slowWanted = !!on && fuel > 0.02;
  slowBtn.classList.toggle('on', slowWanted);
}
slowBtn.addEventListener('pointerdown', e=>{
  e.preventDefault(); e.stopPropagation();
  if(!alive) return;
  setSlow(!slowWanted);                            // второй тап выключает, остаток шкалы сохраняется
});
slowBtn.addEventListener('contextmenu', e=>e.preventDefault());

// клавиатура — чтобы играть и отлаживать с ноутбука
addEventListener('keydown', e=>{
  if(e.code==='ArrowLeft'||e.code==='KeyA') setLane(-1);
  if(e.code==='ArrowRight'||e.code==='KeyD') setLane(1);
  if((e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW') && !e.repeat){ e.preventDefault(); jump(); }
  if(e.code==='ShiftLeft' && !e.repeat) setSlow(!slowWanted);
  if(e.code==='Enter' && !alive) startRun();
});

// ============================================================
//  Обновления
// ============================================================
let worldT=0;                            // «время мира» — тянется медленнее в замедлении
function updateWorld(dt, wdt){
  const move = speed*wdt;
  dist += move;
  worldT += wdt;

  for(const m of moving){
    m.o.position.z += move*m.k;
    if(m.o.position.z > (m.loop>400 ? 200 : 30)) m.o.position.z -= m.loop;
  }
  for(let i=0;i<dustPos.length;i+=3){
    dustPos[i+2] += move*1.15;
    if(dustPos[i+2] > 6){ dustPos[i+2] -= 130; dustPos[i]=rand(-9,9); dustPos[i+1]=rand(0,14); }
  }
  dustGeo.attributes.position.needsUpdate=true;

  planSpawns(dist);

  for(let i=active.length-1;i>=0;i--){
    const o=active[i], u=o.userData;
    o.position.z += move;

    if(u.kind==='mannequin'){                       // бежит навстречу — машет руками и ногами
      const g=worldT*9+u.gait;
      u.limbs && u.limbs.forEach((l,k)=>{ l.rotation.x=Math.sin(g+(k%2)*PI)*(k<2?0.8:0.5); });
    } else if(u.kind==='cell'){
      u.bob+=wdt*3;
      o.position.y = 1.7 + Math.sin(u.bob)*0.25;
      o.rotation.y += wdt*2.4; o.rotation.x += wdt*1.1;
      if(u.core) u.core.scale.setScalar(1+0.25*Math.sin(worldT*7+u.gait));
    } else if(u.kind==='robot'){
      u.mixer && u.mixer.update(wdt);
    }

    if(o.position.z > DESPAWN_Z){ release(o); continue; }

    // столкновение: объект в моей полосе доехал до меня (капсула безвредна — HALF_W 0)
    const half = HALF_W[u.kind];
    if(half > 0 && Math.abs(o.position.z) < 1.5 && Math.abs(o.position.x - laneX) < half){
      const cleared = u.kind==='low' && jumpY > 0.6;      // перекладину можно только перепрыгнуть
      if(!cleared){
        if(SHOOTABLE[u.kind]){                            // врага сносим телом, но получаем по лбу
          const p=o.position.clone(); p.y+=1.0;
          const blue = u.kind==='robot';
          explode(p, blue?0x3a8bff:0xff2626, blue?1.4:0.9);
          sparks(p, blue?14:8, blue?matBlue:matRed);
          release(o);
        }
        hurt();
      }
    }
  }
}

function updatePlayer(dt){
  laneX = damp(laneX, LANES[lane], 0.00002, dt);
  laneVis = damp(laneVis, LANES[lane], 0.0002, dt);        // визуальный крен отстаёт от позиции

  if(!onGround || jumpY>0){
    velY -= GRAVITY*dt;
    jumpY += velY*dt;
    if(jumpY<=0){ jumpY=0; velY=0; onGround=true; }
  }

  const bob = onGround ? Math.sin(clock.getElapsedTime()*speed*0.55)*0.035 : 0;
  camera.position.set(laneX, PLAYER_Y + jumpY + bob, 0);
  // смотрим чуть вниз — так трасса занимает кадр, а не жмётся к горизонту
  camera.rotation.set(-0.22 - jumpY*0.012, 0, (laneX-laneVis)*0.16);
  if(iframe>0) camera.position.x += Math.sin(clock.getElapsedTime()*60)*0.02*iframe;
}

function updateGun(dt){
  const px=0.26, py=-0.32-recoil*0.05, pz=-0.7-recoil*0.04;   // держим в кадре: портрет узкий
  gunHolder.position.set(
    damp(gunHolder.position.x,px,0.0001,dt),
    damp(gunHolder.position.y,py,0.0001,dt),
    damp(gunHolder.position.z,pz,0.0001,dt));
  gunHolder.rotation.set(
    damp(gunHolder.rotation.x, 0.05-recoil*0.5, 0.0001, dt),
    damp(gunHolder.rotation.y, 0.06, 0.0001, dt),
    damp(gunHolder.rotation.z, -0.05+recoil*0.3, 0.0001, dt));
  recoil=damp(recoil,0,0.0001,dt);
  flash.scale.setScalar(lerp(flash.scale.x,0.001,1-Math.pow(0.0001,dt)));
  flash.rotation.z += dt*20;
}

function updateFx(dt){
  for(let i=fragments.length-1;i>=0;i--){
    const f=fragments[i], u=f.userData;
    u.v.y-=15*dt; f.position.addScaledVector(u.v,dt);
    f.rotation.x+=u.av.x*dt; f.rotation.y+=u.av.y*dt;
    u.life-=dt;
    if(u.life<0.4) f.scale.setScalar(Math.max(0.001,u.life/0.4));
    if(u.life<=0){ scene.remove(f); fragments.splice(i,1); }
  }
  for(let i=explosions.length-1;i>=0;i--){
    const e=explosions[i]; e.life-=dt;
    const k=1-e.life/e.max;
    e.o.scale.setScalar((0.3+k*3.2)*e.big); e.o.material.opacity=1-k;
    if(e.life<=0){ scene.remove(e.o); e.o.material.dispose(); explosions.splice(i,1); }
  }
  for(let i=tracers.length-1;i>=0;i--){
    const l=tracers[i]; l.userData.life-=dt;
    l.material.opacity=Math.max(0,l.userData.life/0.08);
    if(l.userData.life<=0){ scene.remove(l); l.geometry.dispose(); tracers.splice(i,1); }
  }
}

function updateHud(dt){
  el.dist.firstChild.textContent = Math.floor(dist);
  fuelBar.style.strokeDashoffset = RING*(1-fuel);
  slowBtn.classList.toggle('empty', fuel<0.15);
  el.tint.classList.toggle('on', timeScale<0.6);
  el.flash.style.opacity = lerp(parseFloat(el.flash.style.opacity)||0, 0, 1-Math.pow(0.0001,dt));
}

function updatePost(dt){
  const u=gradePass.uniforms;
  u.uTime.value=(u.uTime.value+dt)%1000;
  const s=trauma*trauma;
  u.uShake.value.set((Math.random()-0.5)*s*0.05,(Math.random()-0.5)*s*0.05);
  u.uFlash.value=flashAmt;
  u.uSlow.value=1-clamp((timeScale-SLOW_TS)/(1-SLOW_TS),0,1);
  trauma=Math.max(0,trauma-dt*1.9);
  flashAmt=Math.max(0,flashAmt-dt*2.6);
}

// ============================================================
//  Поток игры
// ============================================================
function startRun(){
  active.slice().forEach(release);
  fragments.slice().forEach(f=>scene.remove(f)); fragments.length=0;
  explosions.slice().forEach(e=>scene.remove(e.o)); explosions.length=0;
  tracers.slice().forEach(l=>scene.remove(l)); tracers.length=0;

  lane=1; laneX=0; laneVis=0; jumpY=0; velY=0; onGround=true;
  speed=START_SPEED; dist=0; kills=0; hp=3; iframe=0;
  timeScale=1; fuel=1; nextSpawnAt=40; worldT=0; setSlow(false);

  el.hp.forEach(p=>p.classList.remove('gone'));
  el.kills.firstChild.textContent='0';
  el.dist.firstChild.textContent='0';
  el.menu.style.display='none';
  el.over.style.display='none';
  alive=true;
}
function gameOver(){
  alive=false;
  const d=Math.floor(dist);
  if(d>best){ best=d; try{ localStorage.setItem(BEST_KEY,String(best)); }catch(e){} }
  el.finaldist.textContent=d;
  el.best.textContent='рекорд: '+best+' · убито: '+kills;
  el.over.style.display='flex';
}
document.getElementById('start').addEventListener('click', startRun);
document.getElementById('restart').addEventListener('click', startRun);

// ============================================================
//  Цикл
// ============================================================
const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.05);
  if(paused){ composer.render(); return; }

  if(alive){
    // слоу-мо: держим палец, пока есть шкала
    const wantSlow = slowWanted && fuel>0.02;
    if(slowWanted && !wantSlow) setSlow(false);          // шкала кончилась — время само возвращается
    timeScale = damp(timeScale, wantSlow?SLOW_TS:1, 0.0005, dt);
    fuel = clamp(fuel + (wantSlow ? -dt*SLOW_DRAIN : dt*SLOW_TRICKLE), 0, 1);
    speed = Math.min(MAX_SPEED, speed + SPEED_RAMP*dt);
    if(iframe>0) iframe-=dt;
  } else {
    timeScale = damp(timeScale, 1, 0.0005, dt);
  }

  if(hitstop>0) hitstop-=dt;
  const wdt = dt*timeScale*(hitstop>0?0.15:1);

  if(alive){ updateWorld(dt, wdt); updatePlayer(dt); updateHud(dt); }
  updateGun(dt); updateFx(wdt); updatePost(dt);
  composer.render();
}
animate();

// ============================================================
//  Экран и жизненный цикл
// ============================================================
function checkOrientation(){
  const landscape = innerWidth > innerHeight;
  const phone = matchMedia('(pointer:coarse)').matches;
  const show = landscape && phone;
  el.rotate.style.display = show ? 'flex' : 'none';
  paused = show;
}
addEventListener('resize', ()=>{
  applyFov(); applyLook();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  applyLook();
  checkOrientation();
});
addEventListener('orientationchange', ()=>setTimeout(checkOrientation, 250));
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) clock.getDelta(); });
checkOrientation();

Promise.all(jobs).then(()=>{
  if(robotProto && robotAnims) pools.robot = makePool(makeRobot, 3);   // пул собираем, когда модель готова
  startBtn.disabled=false;
  startBtn.textContent='Играть';
});
