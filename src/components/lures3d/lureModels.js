import * as THREE from 'three';

// Prozedurale 3D-Modelle der Kunstköder für die Seite Koeder3D.
// Bewusst keine GLB/GLTF-Assets: Alles wird aus three.js-Grundgeometrien und
// Canvas-Texturen erzeugt — kein APK-Wachstum, komplett offline, lizenzfrei.
// Jede Factory liefert { group, parts, dispose }:
//   group  THREE.Group, Nase zeigt in +X (Zugrichtung), Ursprung = Körpermitte
//   parts  benannte Teil-Meshes für den LureAnimator (blade, tail, ...)
//   dispose() gibt alle Geometrien, Materialien und Texturen frei

const HOOK_COLOR = 0x3a3f45;

function trackDisposables(target, obj) {
  obj.traverse((node) => {
    if (node.isMesh || node.isPoints) {
      target.push(node.geometry);
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) {
        target.push(mat);
        if (mat.map) target.push(mat.map);
        if (mat.bumpMap) target.push(mat.bumpMap);
      }
    }
  });
}

// 256px-Canvas-Textur mit Rücken-Bauch-Verlauf plus optionalen Punkten und
// Glitzer-Sprenkeln. Die Texturen sind klein genug für 2-GB-Geräte.
// UV-Abwicklung der Lathe-Körper: u läuft um den Umfang (nach rotateZ liegt
// der Bauch bei u=0.25, der Rücken bei u=0.75), v entlang der Körperlänge —
// der Verlauf wird deshalb horizontal über die Texturbreite gelegt.
function createBodyTexture({ back, mid, belly, spots = 0, spotColor = '#1f2937', glitter = 0 }) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, size, 0);
  gradient.addColorStop(0, mid);
  gradient.addColorStop(0.25, belly);
  gradient.addColorStop(0.5, mid);
  gradient.addColorStop(0.75, back);
  gradient.addColorStop(1, mid);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Punktmuster sitzt auf dem Rücken (Band um u=0.75).
  ctx.fillStyle = spotColor;
  for (let i = 0; i < spots; i++) {
    const x = (0.58 + Math.random() * 0.34) * size;
    const y = Math.random() * size;
    const r = 2 + Math.random() * 5;
    ctx.globalAlpha = 0.25 + Math.random() * 0.3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < glitter; i++) {
    ctx.globalAlpha = 0.15 + Math.random() * 0.4;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Gehämmerte Oberfläche für den Blinker als Bump-Map.
function createHammeredBumpTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 6 + Math.random() * 12;
    const dent = ctx.createRadialGradient(x, y, 0, x, y, r);
    dent.addColorStop(0, '#a8a8a8');
    dent.addColorStop(1, '#787878');
    ctx.fillStyle = dent;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

function makeLacquerMaterial(texture) {
  return new THREE.MeshPhysicalMaterial({
    map: texture,
    roughness: 0.32,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
}

function makeMetalMaterial(color, roughness = 0.18) {
  return new THREE.MeshStandardMaterial({ color, metalness: 1.0, roughness });
}

// Fischkörper als LatheGeometry: Profil (Radius über Länge) um die Achse
// gedreht, danach auf die X-Achse gelegt und seitlich abgeflacht.
function makeLatheBody(profile, length, flatten, material) {
  const points = profile.map(
    ([t, r]) => new THREE.Vector2(Math.max(r * length, 0.0005), (t - 0.5) * length)
  );
  const geometry = new THREE.LatheGeometry(points, 28);
  geometry.rotateZ(-Math.PI / 2);
  geometry.scale(1, 1, flatten);
  return new THREE.Mesh(geometry, material);
}

// Einzelner Haken als TubeGeometry entlang einer gebogenen Kurve.
function makeSingleHookMesh(size, material) {
  const s = size;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, s * 1.0, 0),
    new THREE.Vector3(0, s * 0.25, 0),
    new THREE.Vector3(s * 0.12, -s * 0.28, 0),
    new THREE.Vector3(s * 0.5, -s * 0.5, 0),
    new THREE.Vector3(s * 0.82, -s * 0.28, 0),
    new THREE.Vector3(s * 0.86, s * 0.05, 0),
  ]);
  const geometry = new THREE.TubeGeometry(curve, 24, s * 0.055, 6, false);
  return new THREE.Mesh(geometry, material);
}

// Drillingshaken: drei um 120° versetzte Einzelhaken plus Öse.
function makeTrebleHook(size, material) {
  const group = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const hook = makeSingleHookMesh(size, material);
    hook.rotation.y = (i * Math.PI * 2) / 3;
    group.add(hook);
  }
  const eye = new THREE.Mesh(new THREE.TorusGeometry(size * 0.16, size * 0.05, 6, 12), material);
  eye.position.y = size * 1.05;
  // Öse quer zum Sprengring stellen, damit beide Ringe ineinandergreifen.
  eye.rotation.y = Math.PI / 2;
  group.add(eye);
  return group;
}

// Hängt einen Drilling mit der Öse in einen Sprengring bzw. ans Achsende
// (`anchor` = Vector3/Position des Aufhängepunkts). `angle` ist die
// Richtung von der Öse zu den Hakenbögen (Weltwinkel in der XY-Ebene):
// -PI/2 = senkrecht nach unten (Bauchhaken), PI + x = nach hinten und leicht
// abwärts (Schwanzhaken, schleppt im Wasserdruck hinterher). Im lokalen
// Hakenmodell liegt die Öse oben (+Y) und die Bögen unten — deshalb ist die
// Rotation `angle + PI/2`; so zeigen die Spitzen nie zum Köderkörper.
function hangTrebleHook(hook, size, anchor, angle) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const eyeRadius = size * 0.16;
  const eyeX = anchor.x + dirX * eyeRadius;
  const eyeY = anchor.y + dirY * eyeRadius;
  hook.rotation.z = angle + Math.PI / 2;
  hook.position.set(eyeX + dirX * size * 1.05, eyeY + dirY * size * 1.05, 0);
  return hook;
}

// Bauchhaken hängen senkrecht, leicht nach hinten gezogen; Schwanzhaken
// schleppen hinter dem Köder her.
const BELLY_HOOK_ANGLE = -Math.PI / 2 - 0.2;
const TAIL_HOOK_ANGLE = Math.PI + 0.35;

function makeSplitRing(radius, material) {
  return new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.22, 6, 16), material);
}

// Augen: weiße Lederhaut mit schwarzer Pupille, beidseitig.
function addEyes(group, x, y, z, scale = 1) {
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf5f2e8, roughness: 0.3 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0b0f14, roughness: 0.15 });
  for (const side of [1, -1]) {
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.028 * scale, 12, 12), scleraMat);
    sclera.position.set(x, y, side * z);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.014 * scale, 10, 10), pupilMat);
    pupil.position.set(x + 0.004 * scale, y, side * (z + 0.018 * scale));
    group.add(sclera, pupil);
  }
}

// Gewölbtes Metallblatt (Spinnerblatt/Löffel) aus einer Ellipsen-Shape mit
// Vertex-Displacement für Wölbung und optionale S-Krümmung.
function makeCurvedBlade({ length, width, dome, sCurve = 0, material }) {
  const shape = new THREE.Shape();
  shape.ellipse(0, 0, width / 2, length / 2, 0, 0, Math.PI * 2, false);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const rx = x / (width / 2);
    const ry = y / (length / 2);
    const radial = Math.min(rx * rx + ry * ry, 1);
    let z = pos.getZ(i) + dome * (1 - radial);
    if (sCurve) z += sCurve * Math.sin(ry * Math.PI);
    pos.setZ(i, z);
  }
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

export function buildWobbler() {
  const group = new THREE.Group();
  const disposables = [];

  const bodyTexture = createBodyTexture({
    back: '#14532d',
    mid: '#84cc16',
    belly: '#fefce8',
    spots: 26,
    spotColor: '#052e16',
  });
  const bodyMat = makeLacquerMaterial(bodyTexture);
  const body = makeLatheBody(
    [
      [0, 0.015],
      [0.12, 0.05],
      [0.35, 0.115],
      [0.55, 0.13],
      [0.78, 0.1],
      [0.95, 0.05],
      [1, 0.02],
    ],
    1.0,
    0.55,
    bodyMat
  );
  group.add(body);
  addEyes(group, 0.36, 0.03, 0.062);

  // Transparente Polycarbonat-Tauchschaufel unter der Nase, ~40° geneigt.
  const lipMat = new THREE.MeshPhysicalMaterial({
    color: 0xdbeafe,
    transparent: true,
    opacity: 0.35,
    roughness: 0.05,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const lipShape = new THREE.Shape();
  lipShape.ellipse(0, 0, 0.09, 0.14, 0, 0, Math.PI * 2, false);
  const lipGeo = new THREE.ExtrudeGeometry(lipShape, { depth: 0.012, bevelEnabled: false });
  const lip = new THREE.Mesh(lipGeo, lipMat);
  lip.rotation.z = THREE.MathUtils.degToRad(50);
  lip.rotation.y = Math.PI / 2;
  lip.position.set(0.5, -0.1, 0);
  group.add(lip);

  const hookMat = makeMetalMaterial(HOOK_COLOR, 0.35);
  const bellyRing = makeSplitRing(0.035, hookMat);
  bellyRing.position.set(0.16, -0.14, 0);
  const bellyHook = hangTrebleHook(makeTrebleHook(0.11, hookMat), 0.11, bellyRing.position, BELLY_HOOK_ANGLE);
  const tailRing = makeSplitRing(0.035, hookMat);
  tailRing.position.set(-0.52, 0, 0);
  const tailHook = hangTrebleHook(makeTrebleHook(0.11, hookMat), 0.11, tailRing.position, TAIL_HOOK_ANGLE);
  group.add(bellyRing, bellyHook, tailRing, tailHook);

  trackDisposables(disposables, group);
  return {
    group,
    parts: { lip },
    dispose: () => disposables.forEach((d) => d.dispose && d.dispose()),
  };
}

export function buildGummifisch() {
  const group = new THREE.Group();
  const disposables = [];

  const bodyTexture = createBodyTexture({
    back: '#155e75',
    mid: '#67e8f9',
    belly: '#f0fdfa',
    glitter: 140,
  });
  // Weichplastik: matter als Lack, leichter Glanz über sheen — bewusst kein
  // transmission-Material (zu teuer für 2-GB-Geräte).
  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: bodyTexture,
    roughness: 0.38,
    metalness: 0,
    sheen: 0.5,
    sheenColor: new THREE.Color(0x9ae6ff),
  });
  const body = makeLatheBody(
    [
      [0, 0.008],
      [0.1, 0.03],
      [0.3, 0.09],
      [0.55, 0.125],
      [0.8, 0.1],
      [0.95, 0.06],
      [1, 0.03],
    ],
    0.85,
    0.5,
    bodyMat
  );
  body.position.x = 0.05;
  group.add(body);

  // Schwanzteller mit Pivot am Schwanzansatz — der Animator rotiert `tail`.
  const tail = new THREE.Group();
  tail.position.set(-0.37, 0, 0);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.12, 10), bodyMat);
  stem.rotation.z = Math.PI / 2;
  stem.position.x = -0.06;
  const paddle = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.018, 20), bodyMat);
  paddle.rotation.x = Math.PI / 2;
  paddle.rotation.z = Math.PI / 2;
  paddle.position.x = -0.14;
  tail.add(stem, paddle);
  group.add(tail);

  // Jigkopf: Bleikugel mit Einzelhaken, der aus dem Rücken austritt.
  const leadMat = makeMetalMaterial(0x6b7280, 0.45);
  const jigHead = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 18), leadMat);
  jigHead.position.set(0.52, 0.01, 0);
  group.add(jigHead);
  addEyes(group, 0.55, 0.04, 0.075, 1.15);

  const hookMat = makeMetalMaterial(HOOK_COLOR, 0.3);
  // Schenkel liegt waagerecht im Körper (Öse im Bleikopf), der Bogen führt
  // nach oben und die Spitze tritt aus dem Rücken aus und zeigt zum Kopf.
  // Lokal: Öse oben (+Y), Spitze auf +X — Rz(-PI/2) legt den Schenkel nach
  // hinten, Rx(PI) klappt Bogen und Spitze auf die Rückenseite.
  const hook = makeSingleHookMesh(0.26, hookMat);
  hook.rotation.set(Math.PI, 0, -Math.PI / 2);
  hook.position.set(0.28, -0.04, 0);
  const eyelet = makeSplitRing(0.03, hookMat);
  eyelet.position.set(0.52, 0.12, 0);
  eyelet.rotation.y = Math.PI / 2;
  group.add(hook, eyelet);

  trackDisposables(disposables, group);
  return {
    group,
    parts: { tail },
    dispose: () => disposables.forEach((d) => d.dispose && d.dispose()),
  };
}

export function buildSpinner() {
  const group = new THREE.Group();
  const disposables = [];

  const brassMat = makeMetalMaterial(0xc9a227, 0.15);
  const steelMat = makeMetalMaterial(0x9ca3af, 0.12);
  const hookMat = makeMetalMaterial(HOOK_COLOR, 0.3);

  // Drahtachse mit Messing-Perlenkörper.
  const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.72, 8), steelMat);
  axis.rotation.z = Math.PI / 2;
  group.add(axis);
  const beadPositions = [
    [0.05, 0.05],
    [-0.04, 0.06],
    [-0.14, 0.05],
    [-0.22, 0.035],
  ];
  for (const [x, r] of beadPositions) {
    const bead = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 14), brassMat);
    bead.position.x = x;
    group.add(bead);
  }
  const eyelet = makeSplitRing(0.03, steelMat);
  eyelet.position.x = 0.37;
  group.add(eyelet);

  // Blatt hängt am Bügel (Clevis) vorn an der Achse; Pivot `blade` rotiert
  // um die Achse (X), das Blatt selbst steht ~55° abgespreizt.
  const blade = new THREE.Group();
  blade.position.x = 0.24;
  const clevis = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 6, 14), steelMat);
  clevis.rotation.y = Math.PI / 2;
  blade.add(clevis);
  const bladeMesh = makeCurvedBlade({ length: 0.3, width: 0.16, dome: 0.035, material: brassMat });
  bladeMesh.rotation.y = Math.PI / 2 - THREE.MathUtils.degToRad(55);
  bladeMesh.position.set(-0.14, 0, 0.09);
  blade.add(bladeMesh);
  group.add(blade);

  // Roter Reizfaden-Büschel und Drilling am Ende.
  const tuft = new THREE.Mesh(
    new THREE.ConeGeometry(0.045, 0.16, 10),
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.8 })
  );
  tuft.rotation.z = Math.PI / 2;
  tuft.position.x = -0.4;
  // Drilling hängt direkt an der Drahtöse am Achsende (x = -0.36), in
  // Verlängerung der Achse nach hinten.
  const hook = hangTrebleHook(makeTrebleHook(0.1, hookMat), 0.1, new THREE.Vector3(-0.36, 0, 0), Math.PI + 0.1);
  group.add(tuft, hook);

  trackDisposables(disposables, group);
  return {
    group,
    parts: { blade },
    dispose: () => disposables.forEach((d) => d.dispose && d.dispose()),
  };
}

export function buildBlinker() {
  const group = new THREE.Group();
  const disposables = [];

  const bump = createHammeredBumpTexture();
  const spoonMat = new THREE.MeshStandardMaterial({
    color: 0xd4d4d8,
    metalness: 1.0,
    roughness: 0.2,
    bumpMap: bump,
    bumpScale: 0.6,
    side: THREE.DoubleSide,
  });
  const spoon = makeCurvedBlade({
    length: 0.78,
    width: 0.28,
    dome: 0.05,
    sCurve: 0.04,
    material: spoonMat,
  });
  // Löffel längs auf die X-Achse legen (Shape-Längsachse ist Y).
  spoon.rotation.z = Math.PI / 2;
  spoon.rotation.x = Math.PI / 2;
  group.add(spoon);

  const hookMat = makeMetalMaterial(HOOK_COLOR, 0.3);
  const frontRing = makeSplitRing(0.035, hookMat);
  frontRing.position.x = 0.42;
  const rearRing = makeSplitRing(0.035, hookMat);
  rearRing.position.x = -0.42;
  const hook = hangTrebleHook(makeTrebleHook(0.11, hookMat), 0.11, rearRing.position, TAIL_HOOK_ANGLE);
  group.add(frontRing, rearRing, hook);

  trackDisposables(disposables, group);
  return {
    group,
    parts: {},
    dispose: () => disposables.forEach((d) => d.dispose && d.dispose()),
  };
}

export function buildTopwater() {
  const group = new THREE.Group();
  const disposables = [];

  const bodyTexture = createBodyTexture({
    back: '#1e3a8a',
    mid: '#93c5fd',
    belly: '#fff7ed',
    spots: 14,
    spotColor: '#172554',
  });
  const bodyMat = makeLacquerMaterial(bodyTexture);
  // Zigarrenförmiger Stickbait-/Popper-Körper.
  const body = makeLatheBody(
    [
      [0, 0.02],
      [0.15, 0.07],
      [0.45, 0.105],
      [0.75, 0.105],
      [0.95, 0.09],
      [1, 0.075],
    ],
    0.95,
    0.85,
    bodyMat
  );
  group.add(body);
  addEyes(group, 0.3, 0.04, 0.085);

  // Konkave Popper-Maulschale an der Nase.
  const cupMat = new THREE.MeshStandardMaterial({
    color: 0x7f1d1d,
    roughness: 0.35,
    side: THREE.DoubleSide,
  });
  const cup = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), cupMat);
  cup.rotation.z = Math.PI / 2;
  cup.position.x = 0.46;
  group.add(cup);

  const hookMat = makeMetalMaterial(HOOK_COLOR, 0.3);
  const bellyRing = makeSplitRing(0.035, hookMat);
  bellyRing.position.set(0.1, -0.1, 0);
  const bellyHook = hangTrebleHook(makeTrebleHook(0.1, hookMat), 0.1, bellyRing.position, BELLY_HOOK_ANGLE);
  const tailRing = makeSplitRing(0.035, hookMat);
  tailRing.position.set(-0.49, 0, 0);
  const tailHook = hangTrebleHook(makeTrebleHook(0.1, hookMat), 0.1, tailRing.position, TAIL_HOOK_ANGLE);
  group.add(bellyRing, bellyHook, tailRing, tailHook);

  trackDisposables(disposables, group);
  return {
    group,
    parts: {},
    dispose: () => disposables.forEach((d) => d.dispose && d.dispose()),
  };
}

// Zuordnung model-Key (lureGuide.data.js) → Factory. Die Keys werden im
// Test gegen die Datenbasis geprüft, ohne dass die Factories (Canvas!)
// aufgerufen werden müssen.
export const LURE_MODEL_BUILDERS = {
  wobbler: buildWobbler,
  gummifisch: buildGummifisch,
  spinner: buildSpinner,
  blinker: buildBlinker,
  topwater: buildTopwater,
};
