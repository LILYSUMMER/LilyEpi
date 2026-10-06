// AR 가상 옥외광고에서 광고판을 가리는 건물·나무 모형 데이터(assets/virtual-ooh-ar/occluders.json)를 만듭니다.
// 건물은 오픈스트리트맵(층수로 높이를 어림), 나무는 밴쿠버 시 가로수 데이터입니다.
// ooh-ar.js의 SPOT을 옮기면 다시 돌려야 합니다. 페이지는 SPOT과 다른 자리의 데이터는 쓰지 않습니다.
//   node tools/build-occluders.mjs
import { readFile, writeFile } from 'node:fs/promises';

// SPOT.radius(500m) 경계에 걸친 건물까지 담습니다.
const RADIUS = 520;
const LEVEL = 3.2;
const LOBBY = 1.3;
// 이보다 낮은 나무는 광고판(지상 7m 위)을 가릴 일이 거의 없습니다.
const MIN_TREE = 4;

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('assets/virtual-ooh-ar/ooh-ar.js', root), 'utf8');
const found = source.match(/const SPOT = \{\s*lat: (-?[\d.]+),\s*lng: (-?[\d.]+)/);
if (!found) throw new Error('ooh-ar.js에서 SPOT을 찾지 못했습니다.');
const spot = { lat: Number(found[1]), lng: Number(found[2]) };

// ooh-ar.js의 metersFromSpot과 같은 계산입니다. x는 동쪽, z는 남쪽이 +입니다.
const EARTH = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
const tenth = (v) => Math.round(v * 10) / 10;
const local = (lat, lng) => [
  rad(lng - spot.lng) * EARTH * Math.cos(rad(spot.lat)),
  -rad(lat - spot.lat) * EARTH,
];

/* ---------- 건물 ---------- */

function metres(value) {
  if (value == null) return null;
  const n = parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return /ft|'/.test(value) ? n * 0.3048 : n;
}

function heightOf(tags) {
  const tagged = metres(tags.height);
  if (tagged) return tagged;
  const levels = Number(tags['building:levels']);
  if (levels > 0) return LOBBY + (levels + (Number(tags['roof:levels']) || 0)) * LEVEL;
  return { house: 7, garage: 3, shed: 3, kiosk: 3, retail: 5 }[tags.building] ?? 8;
}

function baseOf(tags) {
  const tagged = metres(tags.min_height);
  if (tagged) return tagged;
  const level = Number(tags['building:min_level']);
  return level > 0 ? LOBBY + level * LEVEL : 0;
}

// 여러 길(way)로 쪼개진 바깥 테두리를 끝점끼리 이어 닫힌 고리로 만듭니다.
function joinRings(lines) {
  const key = (p) => `${p.lat},${p.lon}`;
  const open = lines.map((line) => line.slice());
  const rings = [];
  while (open.length) {
    let ring = open.shift();
    let grew = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const line = open[i];
        const end = key(ring[ring.length - 1]);
        if (key(line[0]) === end) ring = ring.concat(line.slice(1));
        else if (key(line[line.length - 1]) === end) ring = ring.concat(line.slice(0, -1).reverse());
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

function toLocalRing(points) {
  const ring = [];
  for (const p of points) {
    const [x, z] = local(p.lat, p.lon);
    const last = ring[ring.length - 1];
    if (!last || Math.hypot(x - last[0], z - last[1]) > 0.05) ring.push([x, z]);
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.05) ring.pop();
  return ring;
}

const area = (ring) => Math.abs(ring.reduce((sum, [x, z], i) => {
  const [nx, nz] = ring[(i + 1) % ring.length];
  return sum + x * nz - nx * z;
}, 0)) / 2;

function inside(x, z, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

// 공개 Overpass 서버는 자주 바빠서(504) 다른 서버로 돌아가며 몇 번 더 묻습니다.
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function overpass(query) {
  const failures = [];
  for (let round = 0; round < 3; round++) {
    for (const url of OVERPASS) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'epispace-occluders/1.0 (contact@epispace.kr)' },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(150000),
        });
        if (response.ok) return await response.json();
        failures.push(`${new URL(url).host} ${response.status}`);
      } catch (error) {
        failures.push(`${new URL(url).host} ${error.name}`);
      }
    }
    await new Promise((done) => setTimeout(done, 15000));
  }
  throw new Error(`Overpass에서 건물을 받지 못했습니다: ${failures.join(', ')}`);
}

async function fetchBuildings() {
  const around = `around:${RADIUS},${spot.lat},${spot.lng}`;
  // 지붕만 있는 차양(roof)과 차고 지붕(carport)은 아래가 뚫려 있어서 뺍니다.
  const query = `[out:json][timeout:120];
(
  way(${around})[building][building!~"^(roof|carport)$"];
  way(${around})["building:part"]["building:part"!="roof"];
  relation(${around})[building][type=multipolygon];
  relation(${around})["building:part"][type=multipolygon];
);
out tags geom;`;
  const { elements } = await overpass(query);

  const shapes = [];
  for (const element of elements) {
    const tags = element.tags || {};
    let rings;
    if (element.type === 'way') rings = element.geometry ? [element.geometry] : [];
    else rings = joinRings((element.members || []).filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry));
    for (const points of rings) {
      const ring = toLocalRing(points);
      if (ring.length < 3 || area(ring) < 2) continue;
      shapes.push({ part: 'building:part' in tags && !('building' in tags), ring, height: heightOf(tags), base: baseOf(tags) });
    }
  }

  // 부분(building:part)으로 나눠 그린 건물은 부분만 씁니다. 바깥 테두리에 가장 높은 층수가 붙어 있어서,
  // 테두리를 그대로 세우면 낮은 저층부까지 탑 높이로 솟습니다.
  const parts = shapes.filter((s) => s.part);
  const centre = (ring) => ring.reduce((c, [x, z]) => [c[0] + x / ring.length, c[1] + z / ring.length], [0, 0]);
  const partCentres = parts.map((p) => centre(p.ring));
  const kept = shapes.filter((s) => s.part || !partCentres.some(([x, z]) => inside(x, z, s.ring)));

  return {
    list: kept
      .filter((s) => s.height > s.base + 0.5)
      .map((s) => [tenth(s.height), tenth(s.base), ...s.ring.flat().map(tenth)]),
    parts: parts.length,
    outlines: shapes.length - parts.length,
  };
}

/* ---------- 나무 ---------- */

const NARROW = /COLUMNAR|FASTIGIATE|PYRAMIDAL|UPRIGHT|SKYROCKET|SPIRE/i;
const CONIFER = /PINE|CEDAR|\bFIR\b|SPRUCE|HEMLOCK|CYPRESS|SEQUOIA|REDWOOD|JUNIPER|\bYEW\b|ARBORVITAE/i;

async function fetchTrees() {
  const params = new URLSearchParams({
    select: 'common_name,height_m,diameter_cm,geo_point_2d',
    where: `within_distance(geo_point_2d, geom'POINT(${spot.lng} ${spot.lat})', ${RADIUS}m)`,
  });
  const response = await fetch(`https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/public-trees/exports/json?${params}`);
  if (!response.ok) throw new Error(`Vancouver open data ${response.status}`);
  const rows = await response.json();

  const flat = [];
  let count = 0;
  for (const row of rows) {
    const top = row.height_m;
    const point = row.geo_point_2d;
    if (!point || !(top >= MIN_TREE)) continue;
    const name = row.common_name || '';
    // 데이터에 수관(잎이 달린 부분) 크기가 없어서 줄기 굵기와 키로 어림합니다. 길가 나무는 아래 가지를 쳐 두어 수관이 높이서 시작합니다.
    const trunk = row.diameter_cm || 20;
    let r = Math.min(0.11 * trunk, 0.32 * top);
    if (NARROW.test(name)) r = Math.min(r, 0.15 * top);
    r = Math.min(7, Math.max(0.8, r));
    const bottom = Math.min(top - 1, CONIFER.test(name) ? Math.max(1, 0.12 * top) : Math.max(2.5, 0.3 * top));
    const [x, z] = local(point.lat, point.lon);
    flat.push(tenth(x), tenth(z), tenth(top), tenth(bottom), tenth(r));
    count += 1;
  }
  return { flat, count, all: rows.length };
}

const [buildings, trees] = await Promise.all([fetchBuildings(), fetchTrees()]);

const data = {
  spot,
  radius: RADIUS,
  made: new Date().toISOString().slice(0, 10),
  credit: {
    buildings: '© OpenStreetMap contributors. Available under the Open Database License (ODbL) 1.0: https://www.openstreetmap.org/copyright',
    trees: 'Contains information licensed under the Open Government Licence – Vancouver: https://opendata.vancouver.ca/pages/licence/',
  },
  // buildings: [높이, 바닥 높이, x0, z0, x1, z1, ...] (m)
  // trees: [x, z, 꼭대기, 수관 아래 끝, 수관 반지름]을 나무마다 이어 붙였습니다 (m)
  format: { buildings: 'height, base, x0, z0, x1, z1, ...', trees: 'x, z, top, bottom, radius per tree' },
  buildings: buildings.list,
  trees: trees.flat,
};

const out = new URL('assets/virtual-ooh-ar/occluders.json', root);
const text = JSON.stringify(data);
await writeFile(out, `${text}\n`);
console.log(`buildings ${buildings.list.length} (outlines ${buildings.outlines}, parts ${buildings.parts})`);
console.log(`trees ${trees.count} of ${trees.all} (shorter than ${MIN_TREE} m left out)`);
console.log(`${out.pathname} ${(text.length / 1024).toFixed(1)} KB`);
