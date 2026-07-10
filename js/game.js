'use strict';
// ============================================================
// 環陣行者 —— 陣法類銀河城 V1 主程式
// ============================================================
(() => {
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const VW = 960, VH = 540, TILE = 32;
const F = Formation, L = Level;
const WORLD_W = L.W * TILE, WORLD_H = L.H * TILE;

const GRAV = 1900, MAXFALL = 920, JUMP_V = -720, MOVE_MAX = 250;

// ---------------- 音效 ----------------
let AC = null, muted = false;
function beep(freq, dur, type, vol, slide) {
  if (muted) return;
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, AC.currentTime);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), AC.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.12, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime + dur);
  } catch (e) { /* 無音效環境 */ }
}
const ELEM_FREQ = { fire: 392, water: 494, wind: 587, earth: 330 };
// ---------------- 環境音樂（程序化 BGM：低音鋪底＋回聲旋律＋風噪水滴） ----------------
const Music = (() => {
  let started = false, mood = '', master = null, drone1 = null, drone2 = null, droneLp = null, noiseGain = null, delayIn = null;
  let noteT = 1.5, dripT = 3, beatT = 0;
  const MOODS = { // 各區域調性
    cave:   { drone: 55.0,  root: 220.0,  scale: [0, 3, 5, 7, 10], note: [2.6, 5.2], drip: [4, 9],  lp: 200, noise: 0.05 },  // A 小調五聲
    water:  { drone: 65.41, root: 261.63, scale: [0, 2, 3, 7, 8],  note: [2.2, 4.4], drip: [1.2, 3.5], lp: 260, noise: 0.06 }, // C 幽泉
    ruin:   { drone: 46.25, root: 185.0,  scale: [0, 1, 5, 6, 10], note: [3.2, 6.4], drip: [7, 13], lp: 150, noise: 0.04 },  // F# 陰暗
    battle: { drone: 55.0,  root: 220.0,  scale: [0, 2, 3, 5, 7],  note: [0.8, 1.6], drip: [99, 99], lp: 330, noise: 0.05 },
  };
  function ensure() {
    if (started) return;
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = 0;
      master.connect(AC.destination);
      master.gain.linearRampToValueAtTime(muted ? 0 : 0.42, AC.currentTime + 3); // 緩入
      // 洞窟回聲
      delayIn = AC.createDelay(1); delayIn.delayTime.value = 0.42;
      const fb = AC.createGain(); fb.gain.value = 0.4;
      const wet = AC.createGain(); wet.gain.value = 0.55;
      delayIn.connect(fb); fb.connect(delayIn); delayIn.connect(wet); wet.connect(master);
      // 低音鋪底（雙鋸齒微失諧＋低通）
      droneLp = AC.createBiquadFilter(); droneLp.type = 'lowpass'; droneLp.frequency.value = 200;
      const dg = AC.createGain(); dg.gain.value = 0.07;
      drone1 = AC.createOscillator(); drone1.type = 'sawtooth'; drone1.frequency.value = 55;
      drone2 = AC.createOscillator(); drone2.type = 'sawtooth'; drone2.frequency.value = 55.3;
      drone1.connect(droneLp); drone2.connect(droneLp); droneLp.connect(dg); dg.connect(master);
      drone1.start(); drone2.start();
      // 風噪（布朗噪音循環）
      const buf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
      const d = buf.getChannelData(0); let last = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3; }
      const noise = AC.createBufferSource(); noise.buffer = buf; noise.loop = true;
      const nlp = AC.createBiquadFilter(); nlp.type = 'lowpass'; nlp.frequency.value = 300;
      noiseGain = AC.createGain(); noiseGain.gain.value = 0.05;
      noise.connect(nlp); nlp.connect(noiseGain); noiseGain.connect(master); noise.start();
      started = true;
    } catch (e) { /* 無音效環境 */ }
  }
  function tone(freq, dur, type, peak, dest) { // 帶包絡的單音，送入回聲
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq;
    const t = AC.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || delayIn); g.connect(master);
    o.start(t); o.stop(t + dur);
  }
  function setMood(name) {
    if (!started || name === mood) return;
    mood = name;
    const m = MOODS[name], t = AC.currentTime;
    drone1.frequency.linearRampToValueAtTime(m.drone, t + 2.5);
    drone2.frequency.linearRampToValueAtTime(m.drone * 1.006, t + 2.5);
    droneLp.frequency.linearRampToValueAtTime(m.lp, t + 2.5);
    noiseGain.gain.linearRampToValueAtTime(m.noise, t + 2.5);
    noteT = Math.min(noteT, 1);
  }
  function update(dt) {
    if (!started || muted || !mood) return;
    const m = MOODS[mood];
    noteT -= dt;
    if (noteT <= 0) { // 旋律音：調式內隨機音
      noteT = m.note[0] + Math.random() * (m.note[1] - m.note[0]);
      const deg = m.scale[Math.floor(Math.random() * m.scale.length)];
      const oct = Math.random() < 0.3 ? 2 : 1;
      tone(m.root * Math.pow(2, deg / 12) * oct, 2.4 + Math.random() * 1.6, 'sine', 0.09);
      if (Math.random() < 0.35) setTimeout(() => { if (!muted) tone(m.root * Math.pow(2, (deg + 7) / 12), 2.2, 'triangle', 0.045); }, 350);
    }
    dripT -= dt;
    if (dripT <= 0) { // 水滴（送回聲）
      dripT = m.drip[0] + Math.random() * (m.drip[1] - m.drip[0]);
      const f0 = 1300 + Math.random() * 700;
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f0, AC.currentTime);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.4, AC.currentTime + 0.09);
      g.gain.setValueAtTime(0.06, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 0.12);
      o.connect(g); g.connect(delayIn);
      o.start(); o.stop(AC.currentTime + 0.13);
    }
    if (mood === 'battle') { // 戰鬥低音脈動
      beatT -= dt;
      if (beatT <= 0) { beatT = 0.46; tone(MOODS.battle.drone * (Math.random() < 0.25 ? 1.5 : 1), 0.3, 'sine', 0.22, master); }
    }
  }
  function setMuted(mu) {
    if (!started) return;
    master.gain.linearRampToValueAtTime(mu ? 0 : 0.42, AC.currentTime + 0.4);
  }
  return { ensure, setMood, update, setMuted, get mood() { return mood; }, get started() { return started; } };
})();

const snd = {
  elem: (el) => beep(ELEM_FREQ[el], 0.12, 'triangle', 0.14),
  bad: () => beep(120, 0.18, 'square', 0.1),
  seal: () => { beep(523, 0.08, 'triangle', 0.12); setTimeout(() => beep(784, 0.12, 'triangle', 0.12), 70); },
  cast: () => beep(220, 0.25, 'sawtooth', 0.12, -140),
  heal: () => beep(660, 0.3, 'sine', 0.12, 220),
  dash: () => beep(300, 0.2, 'triangle', 0.12, 320),
  trap: () => beep(140, 0.22, 'sine', 0.16, -60),
  breakOk: () => { beep(523, 0.14, 'triangle', 0.14); setTimeout(() => beep(659, 0.14, 'triangle', 0.14), 60); setTimeout(() => beep(784, 0.2, 'triangle', 0.14), 120); },
  breakFail: () => beep(110, 0.3, 'square', 0.1),
  hurt: () => beep(160, 0.2, 'sawtooth', 0.14, -80),
  pickup: () => { beep(880, 0.1, 'sine', 0.12); setTimeout(() => beep(1320, 0.16, 'sine', 0.12), 80); },
  die: () => beep(200, 0.5, 'sawtooth', 0.14, -150),
  boom: () => beep(90, 0.35, 'sawtooth', 0.18, -50),
};

// ---------------- 小工具 ----------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
const cx = (e) => e.x + e.w / 2, cy = (e) => e.y + e.h / 2;
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---------------- 世界狀態 ----------------
let state = 'title'; // title | play | dead | victory
let paused = false, overlayOpen = false, mapOpen = false;
let mapPanX = 0, mapPanY = 0; // 地圖平移（格座標）
const visitedRooms = new Set(); // 走訪過的房間索引（跨重生保留）
function roomAt(tx, ty) {
  for (let i = 0; i < L.rooms.length; i++) {
    const b = L.rooms[i].b;
    if (tx >= b[0] - 0.5 && tx <= b[2] + 1.5 && ty >= b[1] - 0.5 && ty <= b[3] + 1.5) return i;
  }
  return -1;
}
function markExplored() {
  const r = roomAt(cx(player) / TILE, cy(player) / TILE);
  if (r >= 0) visitedRooms.add(r);
}
let playTime = 0, shakeT = 0, shakeMag = 0, globalT = 0, bossIntroT = 0, goalMsgT = -9;
let cam = { x: 0, y: 0 };
let enemies = [], projectiles = [], zones = [], traps = [], blasts = [], particles = [], pickups = [], messages = [];
let barriers = [], checkpoints = [], signs = [], goal = null, seals = [];
const deadBosses = new Set();   // 已擊殺頭目（跨重生保留）
let bossIntroData = null;       // 頭目登場卡 {name, sub, img}
const collected = new Set();

const player = {
  x: 0, y: 0, w: 18, h: 40, vx: 0, vy: 0, facing: 1, grounded: false,
  hp: 100, maxHp: 100, mp: 100, maxMp: 100,
  slots: 3, breakSlots: 3,
  seq: [], breakSeq: [], channel: null, breakMode: false,
  iframes: 0, coyote: 0, jumpBuf: 0,
  dashT: 0, dashDir: 1, dashDmg: 0, dashHit: null, ghostT: 0,
  healAura: 0, healRate: 5, anchor: null,
  attackT: 0, attackCd: 0, attackHit: null,
  checkpoint: null, dead: false,
};

function pushMsg(text, dur) { messages.push({ text, t: dur || 2.6 }); if (messages.length > 4) messages.shift(); }
function shake(mag, t) { shakeMag = Math.max(shakeMag, mag); shakeT = Math.max(shakeT, t); }
function burst(x, y, col, n, spd, life) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random() * 0.7) * (spd || 160);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: (life || 0.5) * (0.5 + Math.random() * 0.7), maxLife: life || 0.5, col, size: 2 + Math.random() * 3, grav: 300 });
  }
}

// ---------------- 碰撞 ----------------
function tileSolid(tx, ty) {
  if (L.at(tx, ty) === 1) return true;
  for (let i = 0; i < barriers.length; i++) {
    const b = barriers[i];
    if (!b.broken && tx === b.x && ty >= b.y0 && ty <= b.y1) return true;
  }
  for (let i = 0; i < seals.length; i++) {
    const s = seals[i];
    if (!deadBosses.has(s.boss) && tx === s.x && ty >= s.y0 && ty <= s.y1) return true;
  }
  return false;
}
function rectSolid(x, y, w, h) {
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 1) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (tileSolid(tx, ty)) return true;
  return false;
}
function touchingSpike(e) {
  const x0 = Math.floor(e.x / TILE), x1 = Math.floor((e.x + e.w - 1) / TILE);
  const y0 = Math.floor(e.y / TILE), y1 = Math.floor((e.y + e.h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (L.at(tx, ty) === 2) return true;
  return false;
}
function moveEntity(e, dt, noGrav) {
  e.grounded = false; e.hitWall = false;
  const steps = Math.max(1, Math.ceil((Math.max(Math.abs(e.vx), Math.abs(e.vy) + GRAV * dt) * dt) / 12));
  const sdt = dt / steps;
  for (let s = 0; s < steps; s++) {
    e.x += e.vx * sdt;
    if (rectSolid(e.x, e.y, e.w, e.h)) {
      const dir = Math.sign(e.vx) || 1; let g = 0;
      while (rectSolid(e.x, e.y, e.w, e.h) && g++ < 64) e.x -= dir;
      e.vx = 0; e.hitWall = true;
    }
    if (!noGrav) e.vy = Math.min(e.vy + GRAV * sdt, MAXFALL);
    e.y += e.vy * sdt;
    if (rectSolid(e.x, e.y, e.w, e.h)) {
      const dir = Math.sign(e.vy) || 1; let g = 0;
      while (rectSolid(e.x, e.y, e.w, e.h) && g++ < 64) e.y -= dir;
      if (dir > 0) e.grounded = true;
      e.vy = 0;
    }
  }
}
function groundYBelow(px, py) {
  let ty = Math.floor(py / TILE);
  for (let i = 0; i < 20; i++) { if (tileSolid(Math.floor(px / TILE), ty + i)) return (ty + i) * TILE; }
  return py + 200;
}

// ---------------- 生成 ----------------
function makeWalker(d) {
  return { kind: 'walker', x: d.x * TILE + 4, y: d.floor * TILE - 26, w: 24, h: 26, vx: 0, vy: 0, dir: -1,
    hp: 30, maxHp: 30, speed: 55, touchDmg: 12, flash: 0, burn: null, dead: false, animT: Math.random() * 9 };
}
function makeCaster(d) {
  const hp = d.hp || 45;
  return { kind: 'caster', x: d.x * TILE + 3, y: d.floor * TILE - 36, w: 26, h: 36, vx: 0, vy: 0,
    hp, maxHp: hp, touchDmg: 10, state: 'idle', channel: null, cool: 1 + Math.random(), stunT: 0,
    pool: d.pool, buildSpd: 0.5, healer: !!d.healer, elite: !!d.elite,
    flash: 0, burn: null, dead: false, animT: Math.random() * 9 };
}
function makeThorn(d) {
  return { kind: 'thorn', x: d.x * TILE + 4, y: d.floor * TILE - 30, w: 24, h: 30, vx: 0, vy: 0,
    hp: 35, maxHp: 35, touchDmg: 8, shootCd: 1 + Math.random() * 1.5, shotFlash: 0,
    flash: 0, burn: null, dead: false, animT: Math.random() * 9 };
}
function makeBomber(d) {
  const px = d.x * TILE, py = d.y * TILE;
  return { kind: 'bomber', x: px, y: py, w: 18, h: 16, vx: 0, vy: 0, homeX: px + 9, homeY: py + 8,
    hp: 14, maxHp: 14, touchDmg: 0, fuse: -1, t: Math.random() * 9,
    flash: 0, burn: null, dead: false, animT: Math.random() * 9 };
}
function makeFlyer(d) {
  const px = d.x * TILE, py = d.y * TILE;
  return { kind: 'flyer', x: px, y: py, w: 22, h: 16, vx: 0, vy: 0, homeX: px + 11, homeY: py + 8,
    hp: 22, maxHp: 22, touchDmg: 10, t: Math.random() * 9, flash: 0, burn: null, dead: false, animT: Math.random() * 9 };
}
function makeShell(d) {
  return { kind: 'shell', x: d.x * TILE + 1, y: d.floor * TILE - 26, w: 30, h: 26, vx: 0, vy: 0, dir: -1,
    hp: 70, maxHp: 70, speed: 38, touchDmg: 16, armor: true, flash: 0, burn: null, dead: false, animT: Math.random() * 9 };
}
const BOSS_DEFS = {
  b1: { name: '深陣咒主', sub: '深層陣殿之主', img: 'bossPortrait',  hp: 240, touchDmg: 16, buildSpd: 0.38, cool: 1.6, w: 38, h: 54, healAmt: 50 },
  b2: { name: '疾風梟主', sub: '幽泉水道之王', img: 'boss2Portrait', hp: 300, touchDmg: 14, buildSpd: 0.42, cool: 1.8, w: 46, h: 40, fly: true },
  b3: { name: '祖陣墟主', sub: '萬陣之源',     img: 'boss3Portrait', hp: 420, touchDmg: 18, buildSpd: 0.34, cool: 1.4, w: 44, h: 60, healAmt: 80 },
};
function makeBoss(d) {
  const B = BOSS_DEFS[d.id];
  return { kind: 'boss', id: d.id, name: B.name, sub: B.sub, img: B.img, fly: !!B.fly,
    x: d.x * TILE, y: d.floor * TILE - B.h, w: B.w, h: B.h, vx: 0, vy: 0,
    hp: B.hp, maxHp: B.hp, touchDmg: B.touchDmg, buildSpd: B.buildSpd, coolBase: B.cool, healAmt: B.healAmt || 0,
    state: 'idle', channel: null, cool: 1.5, stunT: 0, healCd: 0, minionCd: 0, castIdx: 0,
    aggro: false, aggroX: d.aggroX * TILE, flash: 0, burn: null, dead: false, animT: 0, eDashT: 0, eDashVx: 0, eDashVy: 0 };
}
function spawnEnemies() {
  enemies = [];
  for (const d of L.spawns.walkers) enemies.push(makeWalker(d));
  for (const d of L.spawns.shells) enemies.push(makeShell(d));
  for (const d of L.spawns.flyers) enemies.push(makeFlyer(d));
  for (const d of L.spawns.thorns) enemies.push(makeThorn(d));
  for (const d of L.spawns.bombers) enemies.push(makeBomber(d));
  for (const d of L.spawns.casters) enemies.push(makeCaster(d));
  for (const d of L.spawns.bosses) if (!deadBosses.has(d.id)) enemies.push(makeBoss(d));
}
function initWorld() {
  seals = L.spawns.seals.map(s => ({ ...s, opened: false }));
  barriers = L.spawns.barriers.map(b => ({ ...b, breakSeq: F.breakSeqOf(b.seq), ana: F.analyze(b.seq), broken: false, rot: Math.random() * 6 }));
  checkpoints = L.spawns.checkpoints.map(c => ({ x: c.x * TILE, y: c.floor * TILE, lit: false }));
  signs = L.spawns.signs.map(s => ({ x: s.x * TILE + 16, y: s.floor * TILE, text: s.text }));
  goal = { x: L.spawns.goal.x * TILE, y: L.spawns.goal.floor * TILE };
  pickups = L.spawns.pickups.map((p, i) => ({ id: 'p' + i, type: p.type, x: p.x * TILE + 16, y: p.floor * TILE - 22, vy: 0, bob: Math.random() * 6 }))
    .filter(p => !collected.has(p.id));
  const ps = L.spawns.player;
  player.x = ps.x * TILE + 7; player.y = ps.floor * TILE - player.h;
  player.checkpoint = { x: player.x, y: player.y };
  spawnEnemies();
  projectiles = []; zones = []; traps = []; blasts = []; particles = [];
}
function respawn() {
  player.hp = player.maxHp; player.mp = player.maxMp; player.dead = false;
  player.vx = 0; player.vy = 0; player.seq = []; player.breakSeq = []; player.channel = null; player.breakMode = false;
  player.dashT = 0; player.healAura = 0; player.iframes = 1.5; player.anchor = null;
  player.x = player.checkpoint.x; player.y = player.checkpoint.y;
  projectiles = []; zones = []; traps = []; blasts = [];
  pickups = pickups.filter(p => p.type !== 'manaOrb');
  spawnEnemies();
  state = 'play';
  pushMsg('於祭壇重生');
}

// ---------------- 輸入 ----------------
const keys = {};
// 元素鍵：火=A 水=S 土=D 風=F（左手 home row）。移動＝方向鍵、跳=X、攻擊=C、確認=Space。
// 破陣＝按一次 Shift 進入破陣模式（元素改輸入破陣序列），Space 發動後自動退出。
const KEY_ELEM = { KeyA: 'fire', KeyS: 'water', KeyD: 'earth', KeyF: 'wind' };
window.addEventListener('keydown', (e) => {
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace'].includes(e.code)) e.preventDefault();
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;

  if (state === 'title') { if (AC === null) beep(1, 0.01, 'sine', 0.001); state = 'play'; return; }
  if (state === 'dead') { if (e.code === 'KeyR') respawn(); return; }
  if (state === 'victory') return;

  if (e.code === 'KeyP') { paused = !paused; return; }
  if (e.code === 'Tab') { overlayOpen = !overlayOpen; mapOpen = false; return; }
  if (e.code === 'KeyM') { mapOpen = !mapOpen; overlayOpen = false; if (mapOpen) { mapPanX = cx(player) / TILE; mapPanY = cy(player) / TILE; } return; }
  if (e.code === 'KeyN') { muted = !muted; Music.setMuted(muted); pushMsg(muted ? '靜音' : '音效開啟', 1.2); return; }
  if (paused || mapOpen) return;

  // Shift：切換破陣模式（按一次進入，確認後或再按一次退出）
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { toggleBreakMode(); return; }

  const elem = KEY_ELEM[e.code];
  if (elem) { if (player.breakMode) appendBreak(elem); else appendCast(elem); return; }
  if (e.code === 'Space') { if (player.breakMode) attemptBreak(); else sealFormation(); return; }
  if (e.code === 'Backspace') {
    if (player.breakMode) { player.breakSeq.pop(); } else if (!player.channel) { player.seq.pop(); }
    return;
  }
  if (e.code === 'KeyC') { doMelee(); return; }
  if (e.code === 'KeyX' || e.code === 'ArrowUp') { player.jumpBuf = 0.12; return; }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ---------------- 佈陣（施放序列） ----------------
function appendCast(elem) {
  if (player.channel) { pushMsg('起陣中，無法再輸入', 1.2); return; }
  if (player.seq.length >= player.slots) { snd.bad(); pushMsg('陣槽已滿（' + player.slots + ' 格）', 1.5); return; }
  const err = F.checkAppend(player.seq, elem);
  if (err) { snd.bad(); pushMsg(err, 1.6); return; }
  player.seq.push(elem); snd.elem(elem);
}
function sealFormation() {
  if (player.channel || player.seq.length === 0) return;
  const err = F.checkClosure(player.seq);
  if (err) { snd.bad(); pushMsg(err, 1.8); player.seq = []; return; }
  const cost = player.seq.length * 7;
  if (player.mp < cost) { snd.bad(); pushMsg('靈力不足（需要 ' + cost + '）', 1.6); player.seq = []; return; }
  player.mp -= cost;
  const seq = player.seq.slice();
  player.seq = [];
  player.channel = { seq, ana: F.analyze(seq), total: F.castTime(seq.length), t: 0, rot: 0 };
  snd.seal();
}

// ---------------- 施放效果 ----------------
function fireProjectile(opts) {
  const dir = player.facing;
  projectiles.push({
    x: cx(player) + dir * 14, y: player.y + 12, vx: dir * (opts.speed || 430), vy: 0,
    r: opts.r || 6, dmg: opts.dmg, owner: 'player', homing: !!opts.homing, burn: opts.burn || null,
    life: 3.5, col: opts.col || F.INFO.fire.color,
  });
}
function castEffect(ana) {
  const eff = ana.effective;
  const main = eff[0], mod = eff[1] || null;
  const power = 1 + 0.4 * Math.max(0, eff.length - 2);
  const px = cx(player), py = cy(player);

  if (main === 'fire') {
    snd.cast();
    if (mod === 'water') { fireProjectile({ dmg: 14 * power, burn: { dps: 6, dur: 3 } }); pushMsg('延燒', 1.2); }
    else if (mod === 'earth') {
      const gx = px + player.facing * 70, gy = groundYBelow(gx, py);
      zones.push({ x: gx - 55, y: gy - 40, w: 110, h: 40, kind: 'fire', owner: 'player', dps: 14 * power, t: 0, dur: 5 });
      pushMsg('火種', 1.2);
    }
    else if (mod === 'wind') { fireProjectile({ dmg: 12 * power, homing: true, speed: 340, col: '#ff8850' }); pushMsg('追蹤火球', 1.2); }
    else fireProjectile({ dmg: 16 * power });
  } else if (main === 'water') {
    snd.heal();
    if (mod === 'fire') { player.hp = clamp(player.hp + 45 * power, 0, player.maxHp); burst(px, py, '#7fd0ff', 24, 140, 0.7); pushMsg('爆療', 1.2); }
    else if (mod === 'wind') { player.healAura = 8; player.healRate = 5 * power; pushMsg('流療（治療跟隨移動）', 1.4); }
    else if (mod === 'earth') {
      const gy = groundYBelow(px, py);
      zones.push({ x: px - 60, y: gy - 46, w: 120, h: 46, kind: 'heal', owner: 'player', dps: 7 * power, t: 0, dur: 8 });
      pushMsg('泉湧', 1.2);
    }
    else { player.hp = clamp(player.hp + 20 * power, 0, player.maxHp); burst(px, py, '#7fd0ff', 12, 100, 0.5); }
  } else if (main === 'earth') {
    snd.trap();
    if (traps.length >= 4) traps.shift();
    const gx = px + player.facing * 40, gy = groundYBelow(gx, py);
    traps.push({ x: gx, y: gy, r: mod === 'wind' ? 110 : 60, mod, power, t: 0, dur: 20 });
    pushMsg(mod === 'fire' ? '爆破陷阱' : mod === 'water' ? '回復陷阱' : mod === 'wind' ? '感應陷阱' : '陷阱', 1.2);
  } else if (main === 'wind') {
    snd.dash();
    if (mod === 'earth') {
      if (!player.anchor) { player.anchor = { x: player.x, y: player.y }; burst(px, py, '#4fe0a0', 16, 120, 0.6); pushMsg('錨點已設下（再次施展即返回）', 1.8); }
      else {
        burst(px, py, '#4fe0a0', 16, 160, 0.6);
        player.x = player.anchor.x; player.y = player.anchor.y; player.vx = 0; player.vy = 0;
        burst(cx(player), cy(player), '#4fe0a0', 24, 180, 0.7);
        player.anchor = null; pushMsg('錨點傳送', 1.2);
      }
    } else {
      player.dashT = 0.24; player.dashDir = player.facing; player.dashHit = new Set();
      player.dashDmg = mod === 'fire' ? 16 * power : 0;
      if (mod === 'water') { player.iframes = Math.max(player.iframes, 0.75); player.ghostT = 0.75; pushMsg('流體位移', 1.2); }
      else if (mod === 'fire') pushMsg('衝刺', 1.2);
    }
  }
}

// ---------------- 破陣 ----------------
function appendBreak(elem) {
  if (player.breakSeq.length >= player.breakSlots) { snd.bad(); pushMsg('破陣槽已滿（' + player.breakSlots + ' 格）', 1.5); return; }
  const err = F.checkAppend(player.breakSeq, elem);
  if (err) { snd.bad(); pushMsg('破陣序列：' + err, 1.6); return; }
  player.breakSeq.push(elem); beep(ELEM_FREQ[elem] * 1.5, 0.1, 'square', 0.09);
}
function breakTarget() {
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (e.dead || !e.channel) continue;
    const d = dist2(cx(player), cy(player), cx(e), e.y - 46);
    if (d < 480 * 480 && d < bestD) { bestD = d; best = { kind: 'enemy', e, cx: cx(e), cy: e.y - 46, seq: e.channel.seq, breakSeq: e.channel.breakSeq, ana: e.channel.ana }; }
  }
  for (const b of barriers) {
    if (b.broken) continue;
    const bx = b.x * TILE + 16, by = ((b.y0 + b.y1) / 2 + 0.5) * TILE;
    const d = dist2(cx(player), cy(player), bx, by);
    const dHoriz = Math.abs(cx(player) - bx);
    if (dHoriz < 190 && d < bestD) { bestD = d; best = { kind: 'barrier', b, cx: bx, cy: by, seq: b.seq, breakSeq: b.breakSeq, ana: b.ana }; }
  }
  return best;
}
// 破陣模式切換：按一次 Shift 進入，元素改輸入到破陣序列
function toggleBreakMode() {
  player.breakMode = !player.breakMode;
  player.breakSeq = [];
  beep(player.breakMode ? 320 : 200, 0.09, 'square', 0.1);
  pushMsg(player.breakMode ? '破陣模式：輸入克制序列，Space 發動（Shift 退出）' : '退出破陣模式', 1.4);
}
function attemptBreak() {
  if (player.breakSeq.length === 0) { player.breakMode = false; pushMsg('退出破陣模式', 1); return; }
  const t = breakTarget();
  if (!t) { snd.bad(); pushMsg('範圍內沒有可破解的陣', 1.5); player.breakSeq = []; player.breakMode = false; return; }
  if (F.matchesRotation(player.breakSeq, t.breakSeq)) {
    snd.breakOk();
    burst(t.cx, t.cy, '#ffffff', 30, 220, 0.8);
    shake(5, 0.25);
    if (t.kind === 'barrier') { t.b.broken = true; pushMsg('結界破除！'); }
    else {
      t.e.channel = null; t.e.state = 'stun'; t.e.stunT = 2.5; t.e.hp -= 10; t.e.flash = 0.2;
      pushMsg('破陣成功！');
    }
    if (t.ana.backlash) { // 反噬：不論敵陣或結界，破陣者皆受反傷
      applyPlayerDamage(16, true);
      pushMsg('反噬陣發動——受到 16 點反噬！', 2.2);
      burst(cx(player), cy(player), '#ff3355', 20, 180, 0.7);
    }
  } else {
    snd.breakFail();
    pushMsg('破陣失敗——序列不符', 1.6);
  }
  player.breakSeq = [];
  player.breakMode = false; // 成功或失敗都跳回一般模式
}

// ---------------- 近身攻擊 ----------------
function doMelee() {
  if (player.attackCd > 0) return;
  player.attackCd = 0.35; player.attackT = 0.18; player.attackHit = new Set();
  beep(500, 0.07, 'triangle', 0.08, 200);
}

// ---------------- 傷害 ----------------
function applyPlayerDamage(dmg, pierce) {
  if (player.dead) return;
  if (!pierce && player.iframes > 0) return;
  player.hp -= dmg;
  if (!pierce) player.iframes = 1;
  snd.hurt(); shake(4, 0.2);
  if (player.channel) { player.channel = null; pushMsg('施展被打斷！', 1.5); }
  if (player.hp <= 0) { player.hp = 0; player.dead = true; state = 'dead'; snd.die(); burst(cx(player), cy(player), '#8899ff', 40, 240, 1); }
}
function damageEnemy(e, dmg, burn, type) {
  if (e.dead) return;
  if (e.armor && (type === 'proj' || type === 'melee')) dmg *= 0.4; // 盾岩獸：法彈/法杖減傷
  e.hp -= dmg; e.flash = 0.15;
  if (burn) e.burn = { dps: burn.dps, t: burn.dur };
  if (e.hp <= 0) {
    e.dead = true;
    snd.die(); burst(cx(e), cy(e), '#ffb27a', 24, 200, 0.8);
    pickups.push({ id: null, type: 'manaOrb', x: cx(e), y: cy(e), vy: -150, bob: 0 });
    if (e.kind === 'boss') {
      deadBosses.add(e.id);
      pushMsg(e.id === 'b3' ? '祖陣墟主已滅——歸環之門開啟！' : e.name + '已滅——封印崩解！', 3.5);
      shake(8, 0.6);
      burst(cx(e), cy(e), '#c080ff', 60, 300, 1.4);
    }
  }
}

// ---------------- 敵人 AI ----------------
function startEnemyChannel(e, seq) {
  e.channel = { seq, ana: F.analyze(seq), breakSeq: F.breakSeqOf(seq), built: 1, buildT: 0, phase: 'build', total: F.castTime(seq.length), t: 0, rot: Math.random() * 6 };
  e.state = 'channel';
}
function bossChooseSeq(e) {
  if (e.id === 'b1') {
    if (e.hp < e.maxHp * 0.55 && e.healCd <= 0) { e.healCd = 18; return ['water', 'fire', 'wind']; } // 爆療自癒
    const opts = [['fire', 'wind', 'earth'], ['fire', 'earth']];
    if (e.hp < e.maxHp * 0.85) opts.push(['fire', 'wind', 'water', 'wind', 'earth']); // 反噬大陣
    const s = opts[e.castIdx % opts.length]; e.castIdx++;
    return s;
  }
  if (e.id === 'b2') { // 疾風梟主：衝鋒／風靈彈／落雷陣
    const opts = [['wind', 'earth', 'fire'], ['wind', 'water'], ['earth', 'water', 'wind']];
    const s = opts[e.castIdx % opts.length]; e.castIdx++;
    return s;
  }
  // b3 祖陣墟主
  if (e.hp < e.maxHp * 0.55 && e.healCd <= 0) { e.healCd = 20; return ['water', 'fire', 'wind', 'water', 'wind', 'earth']; } // 反噬自癒（六元素）
  const opts = [['fire', 'wind', 'earth'], ['wind', 'earth', 'fire']];
  if (e.hp < e.maxHp * 0.8) opts.push(['fire', 'earth', 'water', 'wind', 'earth', 'water']); // 六元素大爆裂
  const s = opts[e.castIdx % opts.length]; e.castIdx++;
  return s;
}
function enemyCast(e, ch) {
  const eff = ch.ana.effective;
  const key = eff[0] + ',' + (eff[1] || '');
  const px = cx(player), py = cy(player);
  const ex = cx(e), ey = e.y + 10;
  if (key === 'fire,wind') {
    const n = e.kind === 'boss' ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(py - ey, px - ex) + (i - (n - 1) / 2) * 0.35;
      projectiles.push({ x: ex, y: ey, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250, r: 7, dmg: e.kind === 'boss' ? 11 : 14, owner: 'enemy', homing: true, life: 4.5, col: '#ff8850' });
    }
    snd.cast();
  } else if (key === 'fire,earth') {
    const gy = groundYBelow(px, py);
    zones.push({ x: px - 60, y: gy - 42, w: 120, h: 42, kind: 'fire', owner: 'enemy', dps: 12, t: 0, dur: 4.5 });
    snd.cast();
  } else if (key === 'water,fire') {
    if (e.healer) { // 水咒師：治療最傷的同伴
      let ally = null, worst = 0.999;
      for (const o of enemies) {
        if (o === e || o.dead) continue;
        if (dist2(cx(o), cy(o), ex, cy(e)) > 340 * 340) continue;
        const r2 = o.hp / o.maxHp;
        if (r2 < worst) { worst = r2; ally = o; }
      }
      const tgt = ally || e;
      tgt.hp = clamp(tgt.hp + 35, 0, tgt.maxHp);
      burst(cx(tgt), cy(tgt), '#7fd0ff', 20, 130, 0.6);
    } else {
      const amt = e.healAmt || 40;
      e.hp = clamp(e.hp + amt, 0, e.maxHp); burst(ex, cy(e), '#7fd0ff', 24, 140, 0.7);
      if (e.kind === 'boss') pushMsg(e.name + '自癒了 ' + amt + ' 點！', 2);
    }
    snd.heal();
  } else if (key === 'fire,water') {
    const big = e.id === 'b3';
    blasts.push({ x: px, y: py, r: big ? 130 : 100, dmg: big ? 38 : 30, delay: big ? 1.0 : 0.85, t: 0, owner: 'enemy' });
    snd.cast();
  } else if (key === 'wind,fire') { // 衝鋒陣：朝玩家高速衝撞
    const dx2 = px - ex, dy2 = py - ey, len = Math.hypot(dx2, dy2) || 1;
    const sp2 = e.fly ? 560 : 500;
    e.eDashT = 0.5; e.eDashVx = dx2 / len * sp2; e.eDashVy = e.fly ? dy2 / len * sp2 : 0;
    snd.dash();
  } else if (key === 'wind,water') { // 風靈彈：三發緩速追蹤
    for (let i = -1; i <= 1; i++) {
      const a = Math.atan2(py - ey, px - ex) + i * 0.5;
      projectiles.push({ x: ex, y: ey, vx: Math.cos(a) * 185, vy: Math.sin(a) * 185, r: 6, dmg: 10, owner: 'enemy', homing: true, life: 5, col: '#7fe8d0' });
    }
    snd.cast();
  } else if (key === 'earth,wind') { // 落雷陣：玩家腳下佈設三枚延遲地雷
    for (let i = -1; i <= 1; i++) {
      const gx = px + i * 70, gy = groundYBelow(gx, py);
      blasts.push({ x: gx, y: gy - 20, r: 62, dmg: 16, delay: 1.5, t: 0, owner: 'enemy' });
    }
    snd.trap();
  } else {
    const a = Math.atan2(py - ey, px - ex);
    projectiles.push({ x: ex, y: ey, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: 6, dmg: 12, owner: 'enemy', homing: false, life: 3.5, col: '#ff6238' });
    snd.cast();
  }
}
function updateEnemy(e, dt) {
  if (e.dead) return;
  e.animT += dt;
  if (e.flash > 0) e.flash -= dt;
  if (e.burn) { e.hp -= e.burn.dps * dt; e.burn.t -= dt; if (e.burn.t <= 0) e.burn = null;
    if (Math.random() < dt * 8) particles.push({ x: e.x + Math.random() * e.w, y: e.y + Math.random() * e.h, vx: 0, vy: -60, life: 0.4, maxLife: 0.4, col: '#ff6238', size: 2.5, grav: 0 });
    if (e.hp <= 0) { damageEnemy(e, 0); return; } }

  if (e.kind === 'walker' || e.kind === 'shell') {
    e.vx = e.dir * e.speed;
    moveEntity(e, dt);
    // 撞牆或前方懸空就折返
    const aheadX = e.dir > 0 ? e.x + e.w + 2 : e.x - 2;
    const footTy = Math.floor((e.y + e.h + 4) / TILE);
    if (e.hitWall || !tileSolid(Math.floor(aheadX / TILE), footTy)) e.dir *= -1;
    return;
  }

  if (e.kind === 'thorn') { // 棘晶弩：定點直射
    moveEntity(e, dt);
    if (e.shotFlash > 0) e.shotFlash -= dt;
    e.shootCd -= dt;
    const dx2 = cx(player) - cx(e), dy2 = cy(player) - cy(e);
    if (e.shootCd <= 0 && !player.dead && Math.abs(dx2) < 430 && Math.abs(dy2) < 170) {
      e.shootCd = 2.2; e.shotFlash = 0.15;
      const a = Math.atan2(dy2, dx2);
      projectiles.push({ x: cx(e), y: e.y + 8, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, r: 5, dmg: 11, owner: 'enemy', homing: false, life: 3, col: '#d9a441' });
      beep(260, 0.08, 'square', 0.07, -60);
    }
    return;
  }

  if (e.kind === 'bomber') { // 爆晶蟲：貼近後倒數自爆
    e.t += dt;
    if (e.fuse >= 0) { // 引信已點燃
      e.fuse -= dt;
      if (Math.floor(e.fuse * 8) % 2 === 0) e.flash = 0.05;
      if (e.fuse <= 0) {
        e.dead = true;
        snd.boom(); shake(5, 0.25);
        burst(cx(e), cy(e), '#ff5060', 26, 220, 0.7);
        if (!player.dead && dist2(cx(e), cy(e), cx(player), cy(player)) < 85 * 85) applyPlayerDamage(22);
        return;
      }
    }
    const pd = dist2(cx(player), cy(player), cx(e), cy(e));
    const aggro = !player.dead && pd < 380 * 380;
    if (e.fuse < 0 && aggro && pd < 62 * 62) { e.fuse = 0.8; beep(1200, 0.1, 'square', 0.1); }
    const tx2 = (aggro ? cx(player) : e.homeX);
    const ty2 = (aggro ? cy(player) : e.homeY) + Math.sin(e.t * 4) * 12;
    const spd = e.fuse >= 0 ? 60 : 120;
    e.vx += clamp(tx2 - cx(e), -1, 1) * 300 * dt; e.vx = clamp(e.vx, -spd, spd);
    e.vy += clamp(ty2 - cy(e), -1, 1) * 300 * dt; e.vy = clamp(e.vy, -spd, spd);
    const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
    if (!rectSolid(nx, e.y, e.w, e.h)) e.x = nx; else e.vx *= -0.6;
    if (!rectSolid(e.x, ny, e.w, e.h)) e.y = ny; else e.vy *= -0.6;
    return;
  }

  if (e.kind === 'flyer') { // 晶蝠：無重力盤旋，追擊玩家
    e.t += dt;
    const aggro = !player.dead && dist2(cx(player), cy(player), cx(e), cy(e)) < 420 * 420;
    const tx2 = (aggro ? cx(player) : e.homeX);
    const ty2 = (aggro ? cy(player) - 14 : e.homeY) + Math.sin(e.t * 3) * 26;
    e.vx += clamp(tx2 - cx(e), -1, 1) * 380 * dt;
    e.vy += clamp(ty2 - cy(e), -1, 1) * 360 * dt;
    e.vx = clamp(e.vx, -165, 165); e.vy = clamp(e.vy, -150, 150);
    const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
    if (!rectSolid(nx, e.y, e.w, e.h)) e.x = nx; else e.vx *= -0.6;
    if (!rectSolid(e.x, ny, e.w, e.h)) e.y = ny; else e.vy *= -0.6;
    return;
  }

  // ---- caster / boss ----
  if (e.eDashT > 0) { // 衝鋒陣進行中
    e.eDashT -= dt;
    e.vx = e.eDashVx; e.vy = e.eDashVy || 0;
    moveEntity(e, dt, !!e.fly);
    if (e.hitWall) e.eDashT = 0;
    if (Math.random() < 0.7) particles.push({ x: cx(e), y: cy(e), vx: 0, vy: 0, life: 0.3, maxLife: 0.3, col: '#c2ffd9', size: 5, grav: 0 });
    return;
  }
  const flyingNow = e.fly && e.stunT <= 0; // 被破陣暈眩時墜地
  if (!flyingNow) moveEntity(e, dt);
  if (e.stunT > 0) { e.stunT -= dt; if (e.stunT <= 0) e.state = 'idle'; return; }
  if (e.cool > 0) e.cool -= dt;
  if (e.healCd > 0) e.healCd -= dt;
  if (e.minionCd > 0) e.minionCd -= dt;

  const inRange = Math.abs(cx(player) - cx(e)) < 460 && Math.abs(cy(player) - cy(e)) < 220 && !player.dead;
  if (e.kind === 'boss') {
    if (!e.aggro && !player.dead && player.x > e.aggroX && Math.abs(cx(player) - cx(e)) < 560) {
      e.aggro = true; bossIntroT = 3.2; bossIntroData = { name: e.name, sub: e.sub, img: e.img };
      pushMsg(e.name + '現身！', 2.5);
    }
    if (flyingNow) { // 疾風梟主：懸浮追蹤
      const ty3 = clamp(player.y - 130, 12 * TILE, 25 * TILE) + Math.sin(e.animT * 1.6) * 30;
      const txT = e.aggro ? cx(player) : e.aggroX + 14 * TILE;
      e.vx += clamp(txT - cx(e), -1, 1) * 240 * dt; e.vx = clamp(e.vx, -115, 115);
      e.vy += clamp(ty3 - e.y, -1, 1) * 240 * dt; e.vy = clamp(e.vy, -105, 105);
      const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
      if (!rectSolid(nx, e.y, e.w, e.h)) e.x = nx; else e.vx = 0;
      if (!rectSolid(e.x, ny, e.w, e.h)) e.y = ny; else e.vy = 0;
    } else if (e.aggro && !e.channel && !e.fly) {
      const d = cx(player) - cx(e);
      if (Math.abs(d) > 70) e.vx = Math.sign(d) * 35; else e.vx = 0;
    } else if (!e.fly) e.vx = 0;
    // 祖陣墟主：低血召喚晶蝠
    if (e.id === 'b3' && e.aggro && e.hp < e.maxHp * 0.5 && e.minionCd <= 0) {
      e.minionCd = 22;
      const alive = enemies.filter(o => o.minion && !o.dead).length;
      if (alive < 2) {
        for (let k = -1; k <= 1; k += 2) {
          const f = makeFlyer({ x: e.x / TILE + k * 3, y: 20 });
          f.minion = true; enemies.push(f);
        }
        burst(cx(e), e.y, '#c080ff', 24, 200, 0.8);
        pushMsg('墟主召喚了晶蝠！', 2);
      }
    }
  }

  if (e.channel) {
    const ch = e.channel;
    ch.rot += dt * 0.9;
    if (ch.phase === 'build') {
      ch.buildT += dt;
      if (ch.buildT >= e.buildSpd) {
        ch.buildT = 0;
        if (ch.built < ch.seq.length) { ch.built++; beep(ELEM_FREQ[ch.seq[ch.built - 1]] * 0.75, 0.08, 'triangle', 0.06); }
        if (ch.built >= ch.seq.length) ch.phase = 'window';
      }
    } else {
      ch.t += dt;
      if (ch.t >= ch.total) { enemyCast(e, ch); e.channel = null; e.state = 'idle'; e.cool = e.kind === 'boss' ? e.coolBase : 2.2; }
    }
  } else if ((e.kind === 'boss' ? e.aggro : inRange) && e.cool <= 0 && e.state !== 'stun') {
    const seq = e.kind === 'boss' ? bossChooseSeq(e) : casterChooseSeq(e);
    startEnemyChannel(e, seq);
  }
}
// 一般咒師選陣：水咒師只在附近有受傷同伴時起補陣
function casterChooseSeq(e) {
  if (e.healer) {
    let wounded = false;
    for (const o of enemies) {
      if (o === e || o.dead || o.hp >= o.maxHp - 1) continue;
      if (dist2(cx(o), cy(o), cx(e), cy(e)) < 340 * 340) { wounded = true; break; }
    }
    if (wounded) return e.pool[0]; // 水火風 補陣
    return e.pool[e.pool.length - 1];
  }
  return e.pool[Math.floor(Math.random() * e.pool.length)];
}

// ---------------- 玩家更新 ----------------
function updatePlayer(dt) {
  if (player.dead) return;
  if (player.iframes > 0) player.iframes -= dt;
  if (player.attackCd > 0) player.attackCd -= dt;
  if (player.attackT > 0) player.attackT -= dt;
  if (player.coyote > 0) player.coyote -= dt;
  if (player.jumpBuf > 0) player.jumpBuf -= dt;
  player.mp = clamp(player.mp + 7 * dt, 0, player.maxMp);
  if (player.healAura > 0) { player.healAura -= dt; player.hp = clamp(player.hp + player.healRate * dt, 0, player.maxHp);
    if (Math.random() < dt * 6) particles.push({ x: player.x + Math.random() * player.w, y: player.y + player.h, vx: 0, vy: -50, life: 0.6, maxLife: 0.6, col: '#7fd0ff', size: 2, grav: 0 }); }

  const chanSlow = player.channel ? 0.55 : 1;
  const left = keys.ArrowLeft, right = keys.ArrowRight;
  if (player.dashT > 0) {
    player.dashT -= dt;
    player.vx = player.dashDir * 820; player.vy = 0;
    moveEntity(player, dt, true);
    if (Math.random() < 0.8) particles.push({ x: cx(player), y: cy(player), vx: 0, vy: 0, life: 0.3, maxLife: 0.3, col: player.dashDmg > 0 ? '#ff8850' : '#4fe0a0', size: 6, grav: 0 });
    if (player.dashDmg > 0) {
      for (const e of enemies) if (!e.dead && !player.dashHit.has(e) && overlap(player, e)) { player.dashHit.add(e); damageEnemy(e, player.dashDmg, null, 'dash'); burst(cx(e), cy(e), '#ff8850', 10, 140, 0.5); }
    }
  } else {
    const target = (right ? 1 : 0) - (left ? 1 : 0);
    if (target !== 0) player.facing = target;
    player.vx += (target * MOVE_MAX * chanSlow - player.vx) * Math.min(1, dt * 12);
    if (player.grounded) player.coyote = 0.09;
    if (player.jumpBuf > 0 && (player.grounded || player.coyote > 0)) {
      player.vy = JUMP_V; player.jumpBuf = 0; player.coyote = 0;
      beep(240, 0.08, 'sine', 0.05, 120);
    }
    if (player.vy < 0 && !(keys.KeyX || keys.ArrowUp)) player.vy += GRAV * 0.9 * dt; // 短按小跳
    moveEntity(player, dt);
  }

  if (touchingSpike(player)) { applyPlayerDamage(20); player.vy = -520; }
  if (player.y > WORLD_H) { applyPlayerDamage(999, true); }

  // 施展窗口進行
  if (player.channel) {
    const ch = player.channel;
    ch.t += dt; ch.rot += dt * 1.1;
    if (ch.t >= ch.total) { castEffect(ch.ana); player.channel = null; }
  }

  // 近戰判定
  if (player.attackT > 0) {
    const hb = { x: player.facing > 0 ? player.x + player.w : player.x - 44, y: player.y - 2, w: 44, h: player.h + 4 };
    for (const e of enemies) if (!e.dead && !player.attackHit.has(e) && overlap(hb, e)) { player.attackHit.add(e); damageEnemy(e, 9, null, 'melee'); burst(cx(e), cy(e), '#cfd6ff', 8, 120, 0.4); }
  }

  // 敵人接觸傷害（爆晶蟲 touchDmg=0，靠自爆，不觸發接觸無敵）
  for (const e of enemies) if (!e.dead && e.touchDmg > 0 && overlap(player, e)) {
    applyPlayerDamage(e.touchDmg);
    if (player.iframes >= 0.99) { player.vx = Math.sign(cx(player) - cx(e)) * 260; player.vy = -260; }
  }

  // 撿拾
  for (const p of pickups) {
    if (p.taken) continue;
    if (p.type === 'manaOrb') {
      p.vy = Math.min(p.vy + GRAV * 0.5 * dt, 300);
      const ny = p.y + p.vy * dt;
      if (!rectSolid(p.x - 4, ny - 4, 8, 8)) p.y = ny; else p.vy = 0;
      const d = dist2(p.x, p.y, cx(player), cy(player));
      if (d < 70 * 70) { p.x += (cx(player) - p.x) * dt * 6; p.y += (cy(player) - p.y) * dt * 6; }
    }
    if (dist2(p.x, p.y, cx(player), cy(player)) < 30 * 30) {
      p.taken = true;
      if (p.type === 'slot') { player.slots++; player.breakSlots++; snd.pickup(); pushMsg('陣槽玉！施放／破陣槽 +1（現在 ' + player.slots + ' 格）', 3); if (p.id) collected.add(p.id); }
      else if (p.type === 'mana') { player.maxMp += 30; player.mp = player.maxMp; snd.pickup(); pushMsg('靈力玉！靈力上限 +30', 3); if (p.id) collected.add(p.id); }
      else if (p.type === 'life') { player.maxHp += 25; player.hp = player.maxHp; snd.pickup(); pushMsg('命玉！生命上限 +25', 3); if (p.id) collected.add(p.id); }
      else { player.mp = clamp(player.mp + 25, 0, player.maxMp); beep(700, 0.1, 'sine', 0.08, 150); }
      burst(p.x, p.y, '#9fe8ff', 14, 130, 0.6);
    }
  }
  pickups = pickups.filter(p => !p.taken);

  // 祭壇
  for (const c of checkpoints) {
    if (Math.abs(cx(player) - (c.x + 16)) < 30 && Math.abs(player.y + player.h - c.y) < 40) {
      if (!c.lit || player.checkpoint.x !== c.x + 7) {
        c.lit = true; player.checkpoint = { x: c.x + 7, y: c.y - player.h };
        player.hp = player.maxHp; player.mp = player.maxMp;
        snd.heal(); pushMsg('祭壇祝福——恢復並記錄重生點', 2.5);
        burst(c.x + 16, c.y - 30, '#ffe08a', 20, 120, 0.8);
      }
    }
  }

  // 終點
  if (goal && Math.abs(cx(player) - (goal.x + 16)) < 34 && Math.abs(player.y + player.h - goal.y) < 60) {
    if (deadBosses.has('b3')) { state = 'victory'; snd.breakOk(); }
    else if (globalT - goalMsgT > 3) { goalMsgT = globalT; pushMsg('邪陣未破，門扉緊閉……', 2.2); }
  }
}

// ---------------- 世界物件更新 ----------------
function updateWorld(dt) {
  // 投射物
  for (const pr of projectiles) {
    pr.life -= dt;
    if (pr.homing) {
      let tx = null, ty = null;
      if (pr.owner === 'player') {
        let bd = 520 * 520;
        for (const e of enemies) if (!e.dead) { const d = dist2(pr.x, pr.y, cx(e), cy(e)); if (d < bd) { bd = d; tx = cx(e); ty = cy(e); } }
      } else if (!player.dead) { tx = cx(player); ty = cy(player); }
      if (tx !== null) {
        const want = Math.atan2(ty - pr.y, tx - pr.x);
        const cur = Math.atan2(pr.vy, pr.vx);
        let dA = want - cur; while (dA > Math.PI) dA -= Math.PI * 2; while (dA < -Math.PI) dA += Math.PI * 2;
        const turn = (pr.owner === 'player' ? 5 : 2.6) * dt;
        const na = cur + clamp(dA, -turn, turn);
        const sp = Math.hypot(pr.vx, pr.vy);
        pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp;
      }
    }
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (Math.random() < 0.5) particles.push({ x: pr.x, y: pr.y, vx: 0, vy: 0, life: 0.25, maxLife: 0.25, col: pr.col, size: 3, grav: 0 });
    if (rectSolid(pr.x - pr.r, pr.y - pr.r, pr.r * 2, pr.r * 2)) { pr.life = 0; burst(pr.x, pr.y, pr.col, 10, 120, 0.4); }
    if (pr.owner === 'player') {
      for (const e of enemies) if (!e.dead && pr.life > 0 && pr.x > e.x - pr.r && pr.x < e.x + e.w + pr.r && pr.y > e.y - pr.r && pr.y < e.y + e.h + pr.r) {
        damageEnemy(e, pr.dmg, pr.burn, 'proj'); pr.life = 0; burst(pr.x, pr.y, pr.col, 12, 150, 0.5);
      }
    } else if (!player.dead && pr.life > 0 && pr.x > player.x - pr.r && pr.x < player.x + player.w + pr.r && pr.y > player.y - pr.r && pr.y < player.y + player.h + pr.r) {
      applyPlayerDamage(pr.dmg); pr.life = 0; burst(pr.x, pr.y, pr.col, 12, 150, 0.5);
    }
  }
  projectiles = projectiles.filter(p => p.life > 0);

  // 區域（火種／泉湧）
  for (const z of zones) {
    z.t += dt;
    if (Math.random() < dt * 20) particles.push({ x: z.x + Math.random() * z.w, y: z.y + z.h, vx: 0, vy: -70, life: 0.5, maxLife: 0.5, col: z.kind === 'fire' ? '#ff6238' : '#3fa8ff', size: 2.5, grav: 0 });
    if (z.kind === 'fire') {
      if (z.owner === 'player') { for (const e of enemies) if (!e.dead && overlap(z, e)) damageEnemy(e, z.dps * dt, null, 'zone'); }
      else if (!player.dead && overlap(z, player) && player.iframes <= 0) { player.hp -= z.dps * dt; if (player.hp <= 0) applyPlayerDamage(1, true); }
    } else if (!player.dead && overlap(z, player)) player.hp = clamp(player.hp + z.dps * dt, 0, player.maxHp);
  }
  zones = zones.filter(z => z.t < z.dur);

  // 陷阱
  for (const t of traps) {
    t.t += dt;
    let fired = false;
    if (t.mod === 'water') {
      if (dist2(t.x, t.y - 10, cx(player), cy(player)) < t.r * t.r) { player.healAura = Math.max(player.healAura, 5); player.healRate = 6 * t.power; fired = true; snd.heal(); pushMsg('回復陷阱發動', 1.2); }
    } else {
      let hit = null;
      for (const e of enemies) if (!e.dead && dist2(t.x, t.y - 10, cx(e), cy(e)) < t.r * t.r) { hit = e; break; }
      const auto = t.mod === 'wind' && t.t > 4;
      if (hit || auto) {
        fired = true; snd.boom(); shake(4, 0.2);
        const R = t.mod === 'wind' ? 130 : 85;
        const dmg = (t.mod === 'fire' ? 30 : t.mod === 'wind' ? 18 : 20) * t.power;
        for (const e of enemies) if (!e.dead && dist2(t.x, t.y - 10, cx(e), cy(e)) < R * R) damageEnemy(e, dmg, t.mod === 'fire' ? { dps: 5, dur: 2 } : null, 'trap');
        burst(t.x, t.y - 10, t.mod === 'wind' ? '#4fe0a0' : '#ff6238', 26, 220, 0.7);
      }
    }
    if (fired) t.t = t.dur;
  }
  traps = traps.filter(t => t.t < t.dur);

  // 延遲爆破（頭目大陣）
  for (const b of blasts) {
    b.t += dt;
    if (b.t >= b.delay) {
      snd.boom(); shake(7, 0.3);
      burst(b.x, b.y, '#ff4433', 40, 280, 0.9);
      if (b.owner === 'enemy' && !player.dead && dist2(b.x, b.y, cx(player), cy(player)) < b.r * b.r) applyPlayerDamage(b.dmg);
    }
  }
  blasts = blasts.filter(b => b.t < b.delay);

  // 粒子
  for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.grav || 0) * dt; }
  particles = particles.filter(p => p.life > 0);
  if (particles.length > 400) particles.splice(0, particles.length - 400);

  // 訊息
  for (const m of messages) m.t -= dt;
  messages = messages.filter(m => m.t > 0);

  for (const b of barriers) if (!b.broken) b.rot += dt * 0.6;
  // 封印崩解演出
  for (const s of seals) {
    if (!s.opened && deadBosses.has(s.boss)) {
      s.opened = true;
      burst(s.x * TILE + 16, ((s.y0 + s.y1) / 2) * TILE, '#ffe08a', 34, 240, 1);
      shake(5, 0.3);
      pushMsg('封印崩解，去路已開！', 2.5);
    }
  }
  if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeMag = 0; }
}

// ---------------- 繪製 ----------------
function drawGlyph(elem, x, y, r, alpha) {
  const info = F.INFO[elem];
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, info.glow); g.addColorStop(1, info.color);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#141220';
  ctx.font = 'bold ' + Math.round(r * 1.1) + 'px "Microsoft JhengHei", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(info.name, x, y + 1);
  ctx.restore();
}
function drawFormationCircle(fx, fy, rad, seq, shown, rot, prog, backlash, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(fx, fy);
  ctx.strokeStyle = backlash ? '#ff3355' : 'rgba(210,220,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = alpha * 0.45;
  ctx.beginPath(); ctx.arc(0, 0, rad * 0.62, 0, Math.PI * 2); ctx.stroke();
  // 旋轉刻紋
  ctx.globalAlpha = alpha * 0.6;
  for (let i = 0; i < 8; i++) {
    const a = rot * 0.7 + i * Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (rad - 5), Math.sin(a) * (rad - 5));
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    ctx.stroke();
  }
  const n = seq.length;
  const pos = [];
  for (let i = 0; i < n; i++) {
    const a = rot + i * Math.PI * 2 / n - Math.PI / 2;
    pos.push([Math.cos(a) * rad * 0.8, Math.sin(a) * rad * 0.8]);
  }
  // 連線
  if (shown >= 2) {
    ctx.globalAlpha = alpha * 0.5;
    ctx.beginPath();
    for (let i = 0; i < Math.min(shown, n); i++) { const p = pos[i]; if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
    if (shown >= n) ctx.closePath();
    ctx.stroke();
  }
  // 進度弧（施展窗口）
  if (prog > 0) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, rad + 6, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
  }
  // 反噬印記
  if (backlash) {
    ctx.globalAlpha = alpha * (0.5 + 0.3 * Math.sin(globalT * 6));
    ctx.fillStyle = '#ff3355';
    ctx.beginPath(); ctx.arc(0, 0, rad * 0.28, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // 起始標記：陣心指針指向第一個元素（隨陣旋轉）
  if (n >= 1) {
    const a0 = rot - Math.PI / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(fx, fy);
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0) * rad * 0.55, Math.sin(a0) * rad * 0.55);
    ctx.lineTo(Math.cos(a0 + 2.6) * 6, Math.sin(a0 + 2.6) * 6);
    ctx.lineTo(Math.cos(a0 - 2.6) * 6, Math.sin(a0 - 2.6) * 6);
    ctx.closePath(); ctx.fill();
    // 讀序方向箭頭（起始元素 → 第二元素）
    if (n >= 2) {
      const aDir = a0 + (Math.PI * 2 / n) * 0.5;
      const mx = Math.cos(aDir) * rad * 0.95, my = Math.sin(aDir) * rad * 0.95;
      const tang = aDir + Math.PI / 2;
      ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx - Math.cos(tang) * 7, my - Math.sin(tang) * 7);
      ctx.lineTo(mx + Math.cos(tang) * 3, my + Math.sin(tang) * 3);
      ctx.lineTo(mx + Math.cos(tang - 2.6) * 5 + Math.cos(tang) * 3, my + Math.sin(tang - 2.6) * 5 + Math.sin(tang) * 3);
      ctx.stroke();
    }
    ctx.restore();
  }
  for (let i = 0; i < Math.min(shown, n); i++) {
    const a = rot + i * Math.PI * 2 / n - Math.PI / 2;
    const r2 = i === 0 ? 14 : 11; // 起始元素放大
    drawGlyph(seq[i], fx + Math.cos(a) * rad * 0.8, fy + Math.sin(a) * rad * 0.8, r2, alpha);
    if (i === 0) { // 起始元素金環
      ctx.save();
      ctx.globalAlpha = alpha * (0.7 + 0.3 * Math.sin(globalT * 5));
      ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(fx + Math.cos(a) * rad * 0.8, fy + Math.sin(a) * rad * 0.8, 17, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
}
// 將圖片滿版覆蓋整個畫面（保持比例、置中裁切）
function drawCover(im) {
  const s = Math.max(VW / im.width, VH / im.height);
  const dw = im.width * s, dh = im.height * s;
  ctx.drawImage(im, (VW - dw) / 2, (VH - dh) / 2, dw, dh);
}
// 圓形頭像徽章（取立繪臉部區域）
function drawPortraitBadge(im, px, py, r, ring) {
  const side = im.width * 0.62;
  const sx = (im.width - side) / 2, sy = im.height * 0.06;
  ctx.save();
  ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  ctx.drawImage(im, sx, sy, side, side, px - r, py - r, r * 2, r * 2);
  ctx.restore();
  ctx.strokeStyle = ring || '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
}
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#171430'); g.addColorStop(0.6, '#100e1f'); g.addColorStop(1, '#0b0a14');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  if (Assets.has('bgCave')) {
    // AI 生成洞窟背景，水平平鋪＋視差捲動
    const im = Assets.img.bgCave;
    const scale = (VH / im.height) * 1.12;
    const dw = im.width * scale, dh = im.height * scale;
    let ox = -((cam.x * 0.35) % dw); if (ox > 0) ox -= dw;
    for (let x = ox; x < VW; x += dw) ctx.drawImage(im, x, VH - dh, dw, dh);
    ctx.fillStyle = 'rgba(9,8,18,0.5)'; ctx.fillRect(0, 0, VW, VH); // 壓暗讓前景突出
    // 區域色調：幽泉水道偏青、祖陣迴廊偏緋
    const teal = clamp((cam.x - 210 * TILE) / 900, 0, 1) * (1 - clamp((cam.x - 348 * TILE) / 900, 0, 1));
    const crimson = clamp((cam.x - 352 * TILE) / 900, 0, 1);
    if (teal > 0.01) { ctx.fillStyle = 'rgba(30,120,110,' + (teal * 0.13).toFixed(3) + ')'; ctx.fillRect(0, 0, VW, VH); }
    if (crimson > 0.01) { ctx.fillStyle = 'rgba(150,30,50,' + (crimson * 0.13).toFixed(3) + ')'; ctx.fillRect(0, 0, VW, VH); }
  } else {
    // 遠景鐘乳石與石丘（兩層視差，程式化 fallback）
    for (let layer = 0; layer < 2; layer++) {
      const par = layer === 0 ? 0.25 : 0.5;
      ctx.fillStyle = layer === 0 ? '#1c1936' : '#242044';
      const off = cam.x * par;
      for (let i = -1; i < 16; i++) {
        const wx = Math.floor((off + i * 90) / 90);
        const sx = wx * 90 - off;
        const h1 = 60 + hash(wx, layer) * 150;
        ctx.beginPath();
        ctx.moveTo(sx, 0); ctx.lineTo(sx + 45, h1); ctx.lineTo(sx + 90, 0); ctx.closePath(); ctx.fill();
        const h2 = 60 + hash(wx, layer + 7) * 170;
        ctx.beginPath();
        ctx.moveTo(sx, VH); ctx.lineTo(sx + 45, VH - h2); ctx.lineTo(sx + 90, VH); ctx.closePath(); ctx.fill();
      }
    }
  }
  // 漂浮塵光
  ctx.fillStyle = 'rgba(140,170,255,0.25)';
  for (let i = 0; i < 30; i++) {
    const dx = (hash(i, 3) * WORLD_W - cam.x * 0.7) % VW, dy = (hash(i, 5) * VH + globalT * (4 + hash(i, 9) * 10)) % VH;
    ctx.fillRect((dx + VW) % VW, dy, 2, 2);
  }
}
function drawTiles() {
  const x0 = Math.floor(cam.x / TILE), x1 = Math.ceil((cam.x + VW) / TILE);
  const y0 = Math.floor(cam.y / TILE), y1 = Math.ceil((cam.y + VH) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const v = L.at(tx, ty);
    const sx = tx * TILE - cam.x, sy = ty * TILE - cam.y;
    if (v === 1) {
      const h = hash(tx, ty);
      ctx.fillStyle = h > 0.85 ? '#3a3556' : h > 0.5 ? '#332e4c' : '#2d2944';
      ctx.fillRect(sx, sy, TILE, TILE);
      if (L.at(tx, ty - 1) === 0) { // 頂面苔光
        ctx.fillStyle = '#4d8f7c'; ctx.fillRect(sx, sy, TILE, 4);
        ctx.fillStyle = 'rgba(110,220,180,0.5)'; ctx.fillRect(sx, sy, TILE, 1);
      }
      if (L.at(tx - 1, ty) === 0) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx, sy, 2, TILE); }
      if (L.at(tx + 1, ty) === 0) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx + TILE - 2, sy, 2, TILE); }
    } else if (v === 2) {
      ctx.fillStyle = '#8d94a8';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(sx + k * 8, sy + TILE);
        ctx.lineTo(sx + k * 8 + 4, sy + 8);
        ctx.lineTo(sx + k * 8 + 8, sy + TILE);
        ctx.closePath(); ctx.fill();
      }
    }
  }
}
function drawBarriers() {
  for (const b of barriers) {
    if (b.broken) continue;
    const sx = b.x * TILE - cam.x;
    const syTop = b.y0 * TILE - cam.y, syBot = (b.y1 + 1) * TILE - cam.y;
    const pulse = 0.55 + 0.2 * Math.sin(globalT * 3 + b.x);
    const info = F.INFO[b.seq[0]];
    ctx.save();
    ctx.globalAlpha = pulse;
    const g = ctx.createLinearGradient(sx, 0, sx + TILE, 0);
    g.addColorStop(0, 'rgba(217,164,65,0)'); g.addColorStop(0.5, info.color); g.addColorStop(1, 'rgba(217,164,65,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx, syTop, TILE, syBot - syTop);
    ctx.restore();
    const cyB = (syTop + syBot) / 2;
    drawFormationCircle(sx + 16, cyB, 44, b.seq, b.seq.length, b.rot, 0, b.ana.backlash, 0.95);
  }
}
function drawZonesTraps() {
  for (const z of zones) {
    const sx = z.x - cam.x, sy = z.y - cam.y;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.12 * Math.sin(globalT * 5);
    ctx.fillStyle = z.kind === 'fire' ? '#ff5530' : '#3fa8ff';
    ctx.fillRect(sx, sy, z.w, z.h);
    ctx.globalAlpha = 0.8;
    ctx.fillRect(sx, sy + z.h - 3, z.w, 3);
    ctx.restore();
  }
  for (const t of traps) {
    const sx = t.x - cam.x, sy = t.y - cam.y;
    const col = t.mod === 'fire' ? '#ff6238' : t.mod === 'water' ? '#3fa8ff' : t.mod === 'wind' ? '#4fe0a0' : '#d9a441';
    ctx.save();
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(globalT * 4 + t.x);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(sx, sy - 4, t.r * 0.55, 10, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(sx, sy - 4, t.r * 0.3, 6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    drawGlyph(t.mod || 'earth', sx, sy - 16, 8, 0.85);
  }
  for (const b of blasts) {
    const sx = b.x - cam.x, sy = b.y - cam.y;
    const p = b.t / b.delay;
    ctx.save();
    ctx.strokeStyle = '#ff4433'; ctx.lineWidth = 2 + p * 3;
    ctx.globalAlpha = 0.4 + p * 0.5;
    ctx.beginPath(); ctx.arc(sx, sy, b.r * (1 - p * 0.15), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.15 + p * 0.3;
    ctx.fillStyle = '#ff4433';
    ctx.beginPath(); ctx.arc(sx, sy, b.r * p, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
function drawSignsPickupsGoal() {
  for (const s of signs) {
    const sx = s.x - cam.x, sy = s.y - cam.y;
    ctx.fillStyle = '#4a4462'; ctx.fillRect(sx - 8, sy - 26, 16, 26);
    ctx.fillStyle = '#615a80'; ctx.fillRect(sx - 12, sy - 30, 24, 8);
    ctx.fillStyle = '#9fd8ff'; ctx.fillRect(sx - 3, sy - 22, 6, 3);
  }
  for (const c of checkpoints) {
    const sx = c.x + 16 - cam.x, sy = c.y - cam.y;
    ctx.fillStyle = '#565073'; ctx.fillRect(sx - 10, sy - 44, 20, 44);
    ctx.fillStyle = '#6e6791'; ctx.fillRect(sx - 14, sy - 50, 28, 8);
    if (c.lit) {
      const fl = 6 + Math.sin(globalT * 8) * 2;
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath(); ctx.arc(sx, sy - 56, fl, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,224,138,0.25)';
      ctx.beginPath(); ctx.arc(sx, sy - 56, fl * 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (const p of pickups) {
    const sx = p.x - cam.x, sy = p.y - cam.y + Math.sin(globalT * 3 + p.bob) * 4;
    if (p.type === 'manaOrb') {
      ctx.fillStyle = '#57c8ff';
      ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      const col = p.type === 'slot' ? '#9fe8ff' : p.type === 'life' ? '#ff8fa8' : '#5f8dff';
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(globalT * 1.5);
      ctx.fillStyle = col;
      ctx.fillRect(-8, -8, 16, 16);
      ctx.restore();
      ctx.fillStyle = p.type === 'life' ? 'rgba(255,143,168,0.25)' : 'rgba(159,232,255,0.25)';
      ctx.beginPath(); ctx.arc(sx, sy, 16 + Math.sin(globalT * 4) * 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (goal) {
    const sx = goal.x + 16 - cam.x, sy = goal.y - cam.y;
    const open = deadBosses.has('b3');
    ctx.save();
    ctx.globalAlpha = open ? 0.9 : 0.25;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i === 1 ? '#c080ff' : '#8f5fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(sx, sy - 40, 20 + i * 8, 34 + i * 6, Math.sin(globalT * 1.2 + i) * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    if (open) {
      ctx.fillStyle = 'rgba(192,128,255,0.3)';
      ctx.beginPath(); ctx.ellipse(sx, sy - 40, 16, 30, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}
function drawSeals() {
  for (const s of seals) {
    if (deadBosses.has(s.boss)) continue;
    const sx = s.x * TILE - cam.x;
    const syT = s.y0 * TILE - cam.y, syB = (s.y1 + 1) * TILE - cam.y;
    if (sx < -40 || sx > VW + 40) continue;
    ctx.save();
    ctx.fillStyle = '#1a1626';
    ctx.fillRect(sx, syT, TILE, syB - syT);
    ctx.globalAlpha = 0.5 + 0.25 * Math.sin(globalT * 2.5 + s.x);
    ctx.strokeStyle = '#c080ff'; ctx.lineWidth = 2;
    ctx.strokeRect(sx + 4, syT + 4, TILE - 8, syB - syT - 8);
    ctx.fillStyle = '#c080ff';
    ctx.font = 'bold 20px "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('封', sx + 16, (syT + syB) / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}
function drawEnemy(e) {
  if (e.dead) return;
  const sx = e.x - cam.x, sy = e.y - cam.y;
  ctx.save();
  if (e.flash > 0) { ctx.globalAlpha = 0.9; ctx.filter = 'brightness(2)'; }
  if (e.kind === 'walker' || e.kind === 'shell') {
    const shell = e.kind === 'shell';
    ctx.fillStyle = shell ? '#4a4640' : '#5a4a44';
    ctx.beginPath(); ctx.ellipse(sx + e.w / 2, sy + e.h - 11, e.w / 2 + 1, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#463a35';
    const step = Math.sin(e.animT * 10) * 3;
    ctx.fillRect(sx + 3, sy + e.h - 6 + step, 5, 6); ctx.fillRect(sx + e.w - 8, sy + e.h - 6 - step, 5, 6);
    if (shell) { // 盾岩獸：石甲殼與稜刺
      ctx.fillStyle = '#7d8697';
      ctx.beginPath(); ctx.arc(sx + e.w / 2, sy + e.h - 12, e.w / 2, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9aa4b8';
      for (let k = 0; k < 3; k++) {
        const kx = sx + 6 + k * 9;
        ctx.beginPath(); ctx.moveTo(kx, sy + e.h - 14); ctx.lineTo(kx + 4, sy + e.h - 24 - k % 2 * 3); ctx.lineTo(kx + 8, sy + e.h - 14); ctx.closePath(); ctx.fill();
      }
    }
    ctx.fillStyle = '#ff5544';
    ctx.fillRect(sx + (e.dir > 0 ? e.w - 8 : 4), sy + e.h - 16, 4, 3);
  } else if (e.kind === 'thorn') {
    // 棘晶弩：晶簇砲塔
    const pulse = 0.6 + 0.4 * Math.sin(e.animT * 3);
    ctx.fillStyle = '#4a4462';
    ctx.beginPath(); ctx.moveTo(sx, sy + e.h); ctx.lineTo(sx + e.w / 2, sy + 6); ctx.lineTo(sx + e.w, sy + e.h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6b6390';
    ctx.beginPath(); ctx.moveTo(sx + 4, sy + e.h); ctx.lineTo(sx + 8, sy + 14); ctx.lineTo(sx + 12, sy + e.h); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx + 12, sy + e.h); ctx.lineTo(sx + 16, sy + 12); ctx.lineTo(sx + 20, sy + e.h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = e.shotFlash > 0 ? '#ffe08a' : '#d9a441';
    ctx.globalAlpha = pulse;
    ctx.beginPath(); ctx.arc(sx + e.w / 2, sy + 10, 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  } else if (e.kind === 'bomber') {
    // 爆晶蟲：小圓晶蟲，點燃引信時閃紅
    const fused = e.fuse >= 0;
    const blink = fused && Math.floor(globalT * 10) % 2 === 0;
    ctx.fillStyle = blink ? '#ff5060' : '#8a5f9e';
    ctx.beginPath(); ctx.ellipse(sx + 9, sy + 8, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
    const flap = Math.sin(e.animT * 16) * 4;
    ctx.strokeStyle = 'rgba(220,200,255,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx + 4, sy + 4); ctx.lineTo(sx - 2, sy - 2 + flap); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + 14, sy + 4); ctx.lineTo(sx + 20, sy - 2 + flap); ctx.stroke();
    ctx.fillStyle = blink ? '#fff' : '#ffb0c0';
    ctx.fillRect(sx + 6, sy + 6, 2, 2); ctx.fillRect(sx + 11, sy + 6, 2, 2);
  } else if (e.kind === 'flyer') {
    // 晶蝠：撲翼水晶蝙蝠
    const flap = Math.sin(e.animT * 14) * 8;
    ctx.fillStyle = '#3d4a66';
    ctx.beginPath(); ctx.moveTo(sx + 11, sy + 8); ctx.lineTo(sx - 8, sy + 2 + flap); ctx.lineTo(sx + 4, sy + 11); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx + 11, sy + 8); ctx.lineTo(sx + 30, sy + 2 + flap); ctx.lineTo(sx + 18, sy + 11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#57668c';
    ctx.beginPath(); ctx.ellipse(sx + 11, sy + 8, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9fe8ff';
    ctx.fillRect(sx + 8, sy + 6, 2, 2); ctx.fillRect(sx + 12, sy + 6, 2, 2);
  } else {
    // 咒師／頭目（袍裝法師形）
    const boss = e.kind === 'boss';
    const bob = Math.sin(e.animT * 2.5) * 2;
    let robe = '#33415e', hood = '#42546e', eye = '#ffcc66', horn = null;
    if (e.healer) { robe = '#2e5e8e'; hood = '#3d76a8'; eye = '#7fd0ff'; }
    else if (e.elite) { robe = '#5e2038'; hood = '#7a2c4c'; eye = '#ff6a88'; }
    if (boss) {
      if (e.id === 'b1') { robe = '#3d2a55'; hood = '#553a75'; eye = '#e070ff'; horn = '#c080ff'; }
      else if (e.id === 'b3') { robe = '#4a1520'; hood = '#6e2030'; eye = '#ff5060'; horn = '#ff8080'; }
    }
    if (boss && e.id === 'b2') {
      // 疾風梟主：巨梟
      const flap = Math.sin(e.animT * 6) * 14;
      ctx.fillStyle = '#4a6b63';
      ctx.beginPath(); ctx.moveTo(sx + 10, sy + 16); ctx.lineTo(sx - 22, sy + 4 + flap); ctx.lineTo(sx + 6, sy + 26); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(sx + e.w - 10, sy + 16); ctx.lineTo(sx + e.w + 22, sy + 4 + flap); ctx.lineTo(sx + e.w - 6, sy + 26); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5f8a7d';
      ctx.beginPath(); ctx.ellipse(sx + e.w / 2, sy + e.h / 2 + 4, e.w / 2 - 2, e.h / 2 - 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7fb3a3';
      ctx.beginPath(); ctx.arc(sx + e.w / 2, sy + 10, 12, 0, Math.PI * 2); ctx.fill();
      // 耳羽與目光
      ctx.strokeStyle = '#c2ffd9'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx + e.w / 2 - 8, sy + 2); ctx.lineTo(sx + e.w / 2 - 13, sy - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx + e.w / 2 + 8, sy + 2); ctx.lineTo(sx + e.w / 2 + 13, sy - 8); ctx.stroke();
      ctx.fillStyle = '#c2ffd9';
      ctx.beginPath(); ctx.arc(sx + e.w / 2 - 5, sy + 9, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + e.w / 2 + 5, sy + 9, 3, 0, Math.PI * 2); ctx.fill();
    } else {
      // 袍
      ctx.fillStyle = robe;
      ctx.beginPath();
      ctx.moveTo(sx + e.w / 2, sy + bob);
      ctx.lineTo(sx + e.w, sy + e.h);
      ctx.lineTo(sx, sy + e.h);
      ctx.closePath(); ctx.fill();
      // 兜帽
      ctx.fillStyle = hood;
      ctx.beginPath(); ctx.arc(sx + e.w / 2, sy + 9 + bob, boss ? 12 : 9, 0, Math.PI * 2); ctx.fill();
      // 目光
      ctx.fillStyle = eye;
      ctx.fillRect(sx + e.w / 2 - 5, sy + 8 + bob, 3, 3); ctx.fillRect(sx + e.w / 2 + 2, sy + 8 + bob, 3, 3);
      if (horn) { // 角冠
        ctx.strokeStyle = horn; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(sx + 8, sy + 4 + bob); ctx.lineTo(sx + 2, sy - 10 + bob); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx + e.w - 8, sy + 4 + bob); ctx.lineTo(sx + e.w - 2, sy - 10 + bob); ctx.stroke();
      }
    }
    if (e.state === 'stun') {
      ctx.fillStyle = '#ffe08a';
      ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('✦', sx + e.w / 2 + Math.sin(globalT * 8) * 8, sy - 8);
    }
  }
  ctx.restore();
  // 血條
  if (e.hp < e.maxHp) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(sx, sy - 8, e.w, 4);
    ctx.fillStyle = '#ff5566'; ctx.fillRect(sx, sy - 8, e.w * clamp(e.hp / e.maxHp, 0, 1), 4);
  }
  // 佈陣圈
  if (e.channel) {
    const ch = e.channel;
    const prog = ch.phase === 'window' ? ch.t / ch.total : 0;
    drawFormationCircle(sx + e.w / 2, sy - 52, 40, ch.seq, ch.built, ch.rot, prog, ch.ana.backlash && ch.built >= ch.seq.length, 0.95);
  }
}
function drawPlayer() {
  if (player.dead) return;
  const sx = player.x - cam.x, sy = player.y - cam.y;
  const flick = player.iframes > 0 && Math.floor(globalT * 14) % 2 === 0;
  if (flick) return;
  const moving = Math.abs(player.vx) > 30;
  const bob = player.grounded && moving ? Math.sin(globalT * 11) * 1.5 : 0;
  ctx.save();
  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(sx + 9, player.grounded ? sy + player.h - cam.y * 0 + 0 : sy + player.h, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // 斗篷
  ctx.fillStyle = '#4b5da8';
  ctx.beginPath();
  ctx.moveTo(sx + 9, sy + 6 + bob);
  ctx.lineTo(sx + 18, sy + player.h);
  ctx.lineTo(sx, sy + player.h);
  ctx.closePath(); ctx.fill();
  // 飄帶（依最後輸入元素上色）
  const lastEl = player.seq[player.seq.length - 1] || (player.channel && player.channel.seq[0]);
  ctx.strokeStyle = lastEl ? F.INFO[lastEl].color : '#7fd0ff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx + 9, sy + 14 + bob);
  ctx.quadraticCurveTo(sx + 9 - player.facing * 12, sy + 18 + bob + Math.sin(globalT * 6) * 3, sx + 9 - player.facing * 18, sy + 12 + bob + Math.sin(globalT * 5) * 4);
  ctx.stroke();
  // 兜帽與臉
  ctx.fillStyle = '#5a6ec2';
  ctx.beginPath(); ctx.arc(sx + 9, sy + 8 + bob, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#141220';
  ctx.beginPath(); ctx.arc(sx + 9 + player.facing * 2, sy + 9 + bob, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9fe8ff';
  ctx.fillRect(sx + 8 + player.facing * 3, sy + 7 + bob, 2, 3);
  ctx.restore();
  // 近戰弧光
  if (player.attackT > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(207,214,255,0.9)'; ctx.lineWidth = 3;
    const ax = sx + 9 + player.facing * 12;
    ctx.beginPath();
    ctx.arc(ax, sy + 20, 30, player.facing > 0 ? -1.1 : Math.PI - 1.1 + 2.2 - 2.2, player.facing > 0 ? 1.1 : Math.PI + 1.1);
    ctx.stroke();
    ctx.restore();
  }
  // 錨點
  if (player.anchor) {
    const axp = player.anchor.x + 9 - cam.x, ayp = player.anchor.y + 40 - cam.y;
    drawGlyph('earth', axp, ayp - 8, 9, 0.6 + 0.2 * Math.sin(globalT * 4));
  }
  // 佈陣中／輸入預覽
  if (player.channel) {
    const ch = player.channel;
    drawFormationCircle(sx + 9, sy + 20, 48, ch.seq, ch.seq.length, ch.rot, ch.t / ch.total, ch.ana.backlash, 0.95);
  } else if (player.seq.length > 0) {
    drawFormationCircle(sx + 9, sy + 20, 44, player.seq, player.seq.length, globalT * 0.4, 0, false, 0.4);
  }
}
function drawBreakReticle() {
  const t = breakTarget();
  if (!t) return;
  const sx = t.cx - cam.x, sy = t.cy - cam.y;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.3 * Math.sin(globalT * 6)) + ')';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.arc(sx, sy, 54, globalT, globalT + Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px "Microsoft JhengHei", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('破陣目標（' + t.seq.length + ' 元素）', sx, sy - 62);
  ctx.restore();
}
function wrapText(str, maxW) {
  const lines = []; let cur = '';
  for (const chc of str) {
    if (ctx.measureText(cur + chc).width > maxW) { lines.push(cur); cur = chc; }
    else cur += chc;
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawSignPanels() {
  ctx.font = '14px "Microsoft JhengHei", sans-serif';
  for (const s of signs) {
    if (Math.abs(cx(player) - s.x) > 70 || Math.abs(player.y + player.h - s.y) > 80) continue;
    const lines = wrapText(s.text, 360);
    const w = 390, h = lines.length * 20 + 18;
    let px = clamp(s.x - cam.x - w / 2, 8, VW - w - 8);
    let py = clamp(s.y - cam.y - 60 - h, 8, VH - h - 8);
    ctx.fillStyle = 'rgba(12,10,24,0.88)';
    ctx.strokeStyle = '#57cfae';
    ctx.lineWidth = 1;
    ctx.fillRect(px, py, w, h); ctx.strokeRect(px, py, w, h);
    ctx.fillStyle = '#dfe6ff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    lines.forEach((ln, i) => ctx.fillText(ln, px + 14, py + 10 + i * 20));
  }
  ctx.textBaseline = 'alphabetic';
}
// 陣式名稱表（主效果,修飾 → 名稱）
const FORMATION_NAMES = {
  'fire,water': '延燒', 'fire,earth': '火種', 'fire,wind': '追蹤火球',
  'water,fire': '爆療', 'water,wind': '流療', 'water,earth': '泉湧',
  'earth,fire': '爆破陷阱', 'earth,water': '回復陷阱', 'earth,wind': '感應陷阱',
  'wind,fire': '衝刺', 'wind,water': '流體位移', 'wind,earth': '錨點傳送',
};
function formationPreview(seq) {
  if (seq.length < 2) return null;
  const ana = F.analyze(seq);
  const name = FORMATION_NAMES[ana.effective[0] + ',' + (ana.effective[1] || '')] || '奧義';
  const closed = F.checkClosure(seq) === null;
  return { name, closed, backlash: ana.backlash };
}
function drawBar(x, y, w, h, ratio, col, label) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x + 1, y + 1, (w - 2) * clamp(ratio, 0, 1), h - 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  if (label) { ctx.fillStyle = '#fff'; ctx.font = '11px "Microsoft JhengHei", sans-serif'; ctx.textAlign = 'left'; ctx.fillText(label, x + 4, y + h - 3); }
}
function drawHud() {
  if (Assets.has('playerPortrait')) {
    drawBar(56, 16, 172, 13, player.hp / player.maxHp, '#e0445c', '生命 ' + Math.ceil(player.hp));
    drawBar(56, 33, 172, 10, player.mp / player.maxMp, '#4a7dde', '靈力 ' + Math.floor(player.mp));
    drawPortraitBadge(Assets.img.playerPortrait, 30, 30, 17, '#7fb0ff');
  } else {
    drawBar(16, 14, 190, 14, player.hp / player.maxHp, '#e0445c', '生命 ' + Math.ceil(player.hp));
    drawBar(16, 32, 190, 11, player.mp / player.maxMp, '#4a7dde', '靈力 ' + Math.floor(player.mp));
  }
  ctx.fillStyle = 'rgba(230,236,255,0.75)';
  ctx.font = '12px "Microsoft JhengHei", sans-serif'; ctx.textAlign = 'right';
  ctx.fillText('Tab 陣式表　M 地圖　P 暫停　N 靜音', VW - 14, 22);

  // 施放序列（左下）
  ctx.textAlign = 'left';
  ctx.fillStyle = '#aeb8e8';
  ctx.fillText('施放陣列（A火 S水 D土 F風 → Space 起陣）', 16, VH - 58);
  for (let i = 0; i < player.slots; i++) {
    const x = 26 + i * 32, y = VH - 34;
    if (i < player.seq.length) drawGlyph(player.seq[i], x, y, 12);
    else { ctx.strokeStyle = 'rgba(174,184,232,0.4)'; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke(); }
  }
  if (player.channel) {
    const ch = player.channel;
    drawBar(16, VH - 16, player.slots * 32, 6, ch.t / ch.total, '#cfd6ff');
    ctx.fillStyle = '#cfd6ff'; ctx.fillText('施展窗口…', 16 + player.slots * 32 + 8, VH - 10);
  } else if (player.seq.length > 0) {
    // 陣式即時預覽
    const pv = formationPreview(player.seq);
    ctx.textAlign = 'left';
    if (!pv) { ctx.fillStyle = '#8a93bf'; ctx.fillText('（至少兩個元素）', 16, VH - 12); }
    else {
      ctx.fillStyle = pv.closed ? '#8fe0c0' : '#ff9db0';
      ctx.fillText('→ ' + pv.name + (pv.backlash ? '・反噬' : '') + (pv.closed ? '（可起陣）' : '（未成圓——尾端須能接回開頭）'), 16, VH - 12);
    }
  }
  // 破陣序列（右下）
  ctx.textAlign = 'right';
  ctx.fillStyle = player.breakMode ? '#ff9db0' : '#8a93bf';
  ctx.fillText(player.breakMode ? '● 破陣模式 —— Space 發動、Shift 退出' : '破陣（按 Shift 進入破陣模式）', VW - 16, VH - 58);
  for (let i = 0; i < player.breakSlots; i++) {
    const x = VW - 26 - (player.breakSlots - 1 - i) * 32, y = VH - 34;
    if (i < player.breakSeq.length) drawGlyph(player.breakSeq[i], x, y, 12);
    else { ctx.strokeStyle = player.breakMode ? 'rgba(255,157,176,0.85)' : 'rgba(174,184,232,0.4)'; ctx.lineWidth = player.breakMode ? 2 : 1; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; }
  }
  // 頭目血條（顯示目前交戰中的頭目）
  let activeBoss = null, abD = Infinity;
  for (const e of enemies) {
    if (e.kind !== 'boss' || !e.aggro || e.dead) continue;
    const d = Math.abs(cx(e) - cx(player));
    if (d < abD) { abD = d; activeBoss = e; }
  }
  if (activeBoss) {
    drawBar(VW / 2 - 180, 20, 360, 13, activeBoss.hp / activeBoss.maxHp, '#a050e0', activeBoss.name);
    if (activeBoss.img && Assets.has(activeBoss.img)) drawPortraitBadge(Assets.img[activeBoss.img], VW / 2 - 198, 26, 15, '#c080ff');
  }
  // 訊息
  ctx.textAlign = 'center';
  ctx.font = '15px "Microsoft JhengHei", sans-serif';
  messages.forEach((m, i) => {
    ctx.globalAlpha = clamp(m.t / 0.4, 0, 1);
    ctx.fillStyle = '#0c0a18';
    const w = ctx.measureText(m.text).width + 24;
    ctx.fillRect(VW / 2 - w / 2, VH - 120 - i * 28, w, 24);
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(m.text, VW / 2, VH - 103 - i * 28);
    ctx.globalAlpha = 1;
  });
}
function drawOverlay() {
  ctx.fillStyle = 'rgba(8,7,18,0.92)';
  ctx.fillRect(40, 30, VW - 80, VH - 60);
  ctx.strokeStyle = '#57cfae'; ctx.strokeRect(40.5, 30.5, VW - 80, VH - 60);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9fe8ff';
  ctx.font = 'bold 18px "Microsoft JhengHei", sans-serif';
  ctx.fillText('陣式總覽（Tab 關閉）', 64, 62);
  ctx.font = '13px "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#8fe0c0';
  ctx.fillText('施放鍵：A火　S水　D土　F風　（跳 X・攻擊 C・起陣 Space）', 64, 80);
  ctx.font = '14px "Microsoft JhengHei", sans-serif';
  const colL = [
    ['#ff8866', '攻・火為首'],
    [null, '　延燒（持續灼燒）……… A D S'],
    [null, '　火種（燃燒地帶）……… A D'],
    [null, '　追蹤火球 ………………… A F D'],
    ['#7fd0ff', '療・水為首'],
    [null, '　爆療（瞬間大量）……… S A F'],
    [null, '　流療（治療跟隨）……… S F'],
    [null, '　泉湧（回血區）………… S A D'],
    ['#f2d49b', '陷・土為首（延遲觸發）'],
    [null, '　爆破陷阱 ………………… D A'],
    [null, '　回復陷阱 ………………… D S A'],
    [null, '　感應陷阱（自動）……… D S F'],
    ['#c2ffd9', '移・風為首'],
    [null, '　衝刺（撞擊傷害）……… F D A'],
    [null, '　流體位移（殘影無敵）… F S'],
    [null, '　錨點傳送 ………………… F D S'],
  ];
  colL.forEach((ln, i) => {
    ctx.fillStyle = ln[0] || '#dfe6ff';
    ctx.fillText(ln[1], 64, 92 + i * 24);
  });
  const colR = [
    ['#ffd7d7', '克制環：水克火・火克風・風克土・土克水'],
    [null, ''],
    ['#dfe6ff', '規則'],
    [null, '・同元素不能相鄰；被克元素不能接續'],
    [null, '・序列首尾必須接成圓（Space 起陣時檢查）'],
    [null, '・主效果＝第一個有效元素'],
    [null, '・間接元素只作橋接，不生效果'],
    [null, '　（例 A D S：土被 火/水 夾住而透明化）'],
    [null, ''],
    ['#ff9db0', '反噬陣'],
    [null, '・兩個以上「同元素」間接元素即成反噬'],
    [null, '・例：A F S F D（兩個風皆為間接）'],
    [null, '・反噬陣被破時，破陣者受到反傷'],
    [null, ''],
    ['#c2ffd9', '破陣'],
    [null, '・把對方序列每個元素換成克制它的元素'],
    [null, '・按 Shift 進破陣模式，輸入後 Space 發動'],
    [null, '・陣會旋轉——從任一位置讀出週期皆可'],
  ];
  colR.forEach((ln, i) => {
    ctx.fillStyle = ln[0] || '#dfe6ff';
    ctx.fillText(ln[1], 500, 92 + i * 24);
  });
}
function drawBossIntro() {
  if (!bossIntroData) return;
  const appear = clamp((3.2 - bossIntroT) * 3, 0, 1); // 進場
  const fade = clamp(bossIntroT * 1.5, 0, 1);         // 收場淡出
  const alpha = Math.min(appear, fade);
  const slide = (1 - appear) * 130;
  ctx.save();
  ctx.globalAlpha = alpha;
  const pw = 160, ph = 216, px = VW - pw - 46 + slide, py = VH / 2 - ph / 2 - 10;
  if (bossIntroData.img && Assets.has(bossIntroData.img)) {
    const im = Assets.img[bossIntroData.img];
    ctx.save();
    ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.closePath(); ctx.clip();
    const s = Math.max(pw / im.width, ph / im.height);
    ctx.drawImage(im, px + (pw - im.width * s) / 2, py + (ph - im.height * s) / 2, im.width * s, im.height * s);
    ctx.restore();
    ctx.strokeStyle = '#c080ff'; ctx.lineWidth = 3; ctx.strokeRect(px, py, pw, ph);
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e6ccff'; ctx.font = '15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('—— ' + bossIntroData.sub + ' ——', px - 16, VH / 2 - 14);
  ctx.fillStyle = '#c080ff'; ctx.font = 'bold 34px "Microsoft JhengHei", sans-serif';
  ctx.fillText(bossIntroData.name.split('').join(' '), px - 16, VH / 2 + 22);
  ctx.restore();
}
function rr(x, y, w, h, r) { // 圓角矩形路徑
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}
function drawMap() {
  const PX = 24, PY = 40, PW = VW - 48, PH = VH - 86;
  // 墨藍圖紙底
  const bg = ctx.createLinearGradient(0, PY, 0, PY + PH);
  bg.addColorStop(0, 'rgba(10,14,26,0.97)'); bg.addColorStop(1, 'rgba(7,9,18,0.97)');
  ctx.fillStyle = bg; ctx.fillRect(PX, PY, PW, PH);
  ctx.strokeStyle = '#5a6b8c'; ctx.lineWidth = 2; ctx.strokeRect(PX + 3.5, PY + 3.5, PW - 7, PH - 7);
  ctx.strokeStyle = 'rgba(90,107,140,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(PX + 8.5, PY + 8.5, PW - 17, PH - 17);

  const k = 3.6; // 每格像素
  const vx = PX + PW / 2 - mapPanX * k, vy = PY + PH / 2 - mapPanY * k;
  const mx = (tx) => vx + tx * k, my = (ty) => vy + ty * k;

  ctx.save();
  rr(PX + 10, PY + 10, PW - 20, PH - 20, 6); ctx.clip();

  // 房間（走訪過才顯現；HK 式輪廓房）
  const curRoom = roomAt(cx(player) / TILE, cy(player) / TILE);
  const areaSeen = [false, false, false];
  for (let i = 0; i < L.rooms.length; i++) {
    if (!visitedRooms.has(i)) continue;
    const rm = L.rooms[i]; areaSeen[rm.a] = true;
    const b = rm.b;
    const x = mx(b[0]), y = my(b[1]), w = (b[2] - b[0] + 1) * k, h = (b[3] - b[1] + 1) * k;
    rr(x, y, w, h, 5);
    ctx.fillStyle = rm.secret ? '#232c44' : '#1b2438';
    ctx.fill();
    const col = L.areas[rm.a].color;
    ctx.strokeStyle = col; ctx.lineWidth = i === curRoom ? 2.5 : 1.5;
    ctx.globalAlpha = i === curRoom ? (0.8 + 0.2 * Math.sin(globalT * 5)) : 0.75;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // 區域名稱（該區任一房間走訪過即顯示）
  ctx.font = 'bold 15px "Microsoft JhengHei", serif';
  ctx.textAlign = 'center';
  const areaBounds = [[2, 214], [214, 366], [366, 414]];
  for (let a = 0; a < 3; a++) {
    if (!areaSeen[a]) continue;
    ctx.fillStyle = L.areas[a].color;
    ctx.globalAlpha = 0.9;
    ctx.fillText(L.areas[a].name, mx((areaBounds[a][0] + areaBounds[a][1]) / 2), my(8));
    ctx.globalAlpha = 1;
  }
  // 圖標（僅在其所屬房間走訪過時顯示）
  const seen = (tx, ty) => visitedRooms.has(roomAt(tx, ty));
  for (const c of checkpoints) if (c.lit) { // 祭壇：燈座
    const x = mx(c.x / TILE + 0.5), y = my(c.y / TILE - 1.2);
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath(); ctx.arc(x, y - 2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,224,138,0.3)';
    ctx.beginPath(); ctx.arc(x, y - 2, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a89468'; ctx.fillRect(x - 3, y + 1, 6, 3);
  }
  for (const b of barriers) if (!b.broken && seen(b.x, (b.y0 + b.y1) / 2)) {
    ctx.fillStyle = F.INFO[b.seq[0]].color;
    ctx.fillRect(mx(b.x) - 1, my(b.y0), k + 2, (b.y1 - b.y0 + 1) * k);
  }
  for (const s of seals) if (!deadBosses.has(s.boss) && seen(s.x - 1, (s.y0 + s.y1) / 2)) {
    ctx.fillStyle = '#c080ff';
    ctx.fillRect(mx(s.x) - 1, my(s.y0), k + 2, (s.y1 - s.y0 + 1) * k);
  }
  for (const e of enemies) if (e.kind === 'boss' && !e.dead && seen(e.x / TILE, e.y / TILE + 1)) { // 頭目：角紋章
    const x = mx(e.x / TILE + 0.7), y = my(e.y / TILE + 1);
    ctx.fillStyle = '#ff5060';
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ff9db0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x - 7, y - 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x + 7, y - 9); ctx.stroke();
  }
  for (const p of pickups) if (p.type !== 'manaOrb' && seen(p.x / TILE, p.y / TILE)) {
    ctx.fillStyle = p.type === 'life' ? '#ff8fa8' : '#9fe8ff';
    const x = mx(p.x / TILE), y = my(p.y / TILE);
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-2.5, -2.5, 5, 5); ctx.restore();
  }
  if (goal && seen(goal.x / TILE, goal.y / TILE - 1)) { // 歸環之門
    const x = mx(goal.x / TILE + 0.5), y = my(goal.y / TILE - 2);
    ctx.strokeStyle = deadBosses.has('b3') ? '#c080ff' : 'rgba(192,128,255,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 5, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x - 5, y + 5); ctx.moveTo(x + 5, y); ctx.lineTo(x + 5, y + 5); ctx.stroke();
  }
  // 玩家標記（白菱形脈動）
  {
    const x = mx(cx(player) / TILE), y = my(cy(player) / TILE);
    const s = 4 + Math.sin(globalT * 5) * 1.2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 8 + Math.sin(globalT * 3) * 2, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore(); // 解除 clip

  // 標題與圖例
  ctx.fillStyle = '#c8d8f0';
  ctx.font = 'bold 18px "Microsoft JhengHei", serif';
  ctx.textAlign = 'left';
  ctx.fillText('❖ 洞窟輿圖', PX + 22, PY + 30);
  ctx.font = '12px "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#8a9ab8';
  ctx.textAlign = 'right';
  ctx.fillText('方向鍵平移　M 關閉', PX + PW - 20, PY + 28);
  const legend = [['#ffffff', '你'], ['#ffe08a', '祭壇'], ['#d9a441', '結界'], ['#c080ff', '封印'], ['#ff5060', '頭目'], ['#9fe8ff', '寶物']];
  ctx.textAlign = 'left';
  legend.forEach((lg, i) => {
    const lx = PX + 30 + i * 100;
    ctx.fillStyle = lg[0];
    ctx.save(); ctx.translate(lx, VH - 60); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    ctx.fillStyle = '#c8d8f0'; ctx.fillText(lg[1], lx + 12, VH - 56);
  });
}
function drawScreens() {
  if (state === 'title') {
    if (Assets.has('titleScene')) { drawCover(Assets.img.titleScene); ctx.fillStyle = 'rgba(8,7,18,0.6)'; ctx.fillRect(0, 0, VW, VH); }
    else { ctx.fillStyle = 'rgba(8,7,18,0.85)'; ctx.fillRect(0, 0, VW, VH); }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fe8ff';
    ctx.font = 'bold 52px "Microsoft JhengHei", sans-serif';
    ctx.fillText('環 陣 行 者', VW / 2, 170);
    ctx.fillStyle = '#57cfae';
    ctx.font = '18px "Microsoft JhengHei", sans-serif';
    ctx.fillText('—— 陣法類銀河城 V1 ——', VW / 2, 205);
    ctx.fillStyle = '#dfe6ff';
    ctx.font = '15px "Microsoft JhengHei", sans-serif';
    const lines = [
      '移動 ←→　跳躍 X　法杖 C',
      '施放：A火 S水 D土 F風 輸入元素，Space 起陣',
      '破陣：按 Shift 進入破陣模式，輸入克制序列後 Space 發動',
      'Tab 陣式表　M 地圖　Backspace 撤銷輸入',
    ];
    lines.forEach((ln, i) => ctx.fillText(ln, VW / 2, 270 + i * 28));
    ctx.fillStyle = '#ffe9b0';
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(globalT * 3);
    ctx.fillText('按任意鍵開始', VW / 2, 430);
    ctx.globalAlpha = 1;
    const els = ['fire', 'water', 'wind', 'earth'];
    els.forEach((el, i) => drawGlyph(el, VW / 2 - 75 + i * 50, 470, 16));
  } else if (state === 'dead') {
    ctx.fillStyle = 'rgba(20,4,10,0.6)'; ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff9db0';
    ctx.font = 'bold 40px "Microsoft JhengHei", sans-serif';
    ctx.fillText('隕　落', VW / 2, VH / 2 - 20);
    ctx.fillStyle = '#dfe6ff';
    ctx.font = '16px "Microsoft JhengHei", sans-serif';
    ctx.fillText('按 R 於祭壇重生', VW / 2, VH / 2 + 24);
  } else if (state === 'victory') {
    ctx.fillStyle = 'rgba(8,7,18,0.8)'; ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe08a';
    ctx.font = 'bold 44px "Microsoft JhengHei", sans-serif';
    ctx.fillText('陣 成 ・ 通 關', VW / 2, VH / 2 - 30);
    ctx.fillStyle = '#dfe6ff';
    ctx.font = '16px "Microsoft JhengHei", sans-serif';
    const mm = Math.floor(playTime / 60), ss = Math.floor(playTime % 60);
    ctx.fillText('用時 ' + mm + ' 分 ' + (ss < 10 ? '0' : '') + ss + ' 秒', VW / 2, VH / 2 + 16);
    ctx.fillText('（重新整理頁面可再來一次）', VW / 2, VH / 2 + 46);
  } else if (paused) {
    ctx.fillStyle = 'rgba(8,7,18,0.6)'; ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#dfe6ff';
    ctx.font = 'bold 30px "Microsoft JhengHei", sans-serif';
    ctx.fillText('暫　停', VW / 2, VH / 2);
  }
}
function render() {
  ctx.clearRect(0, 0, VW, VH);
  drawBackground();
  ctx.save();
  if (shakeT > 0) ctx.translate((Math.random() - 0.5) * shakeMag, (Math.random() - 0.5) * shakeMag);
  drawTiles();
  drawZonesTraps();
  drawBarriers();
  drawSeals();
  drawSignsPickupsGoal();
  for (const e of enemies) drawEnemy(e);
  drawPlayer();
  // 投射物
  for (const pr of projectiles) {
    ctx.fillStyle = pr.col;
    ctx.beginPath(); ctx.arc(pr.x - cam.x, pr.y - cam.y, pr.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(pr.x - cam.x, pr.y - cam.y, pr.r * 0.4, 0, Math.PI * 2); ctx.fill();
  }
  // 粒子
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x - cam.x - p.size / 2, p.y - cam.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  if (state === 'play' && (player.breakMode || player.breakSeq.length > 0)) drawBreakReticle();
  drawSignPanels();
  ctx.restore();
  if (state !== 'title') drawHud();
  if (state === 'play' && bossIntroT > 0) drawBossIntro();
  if (overlayOpen && state === 'play') drawOverlay();
  if (mapOpen && state === 'play') drawMap();
  drawScreens();
}

// ---------------- 主迴圈 ----------------
let lastTime = performance.now();
let manualStep = false; // 除錯：手動推進影格時停用 rAF 排程
function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  globalT += dt;
  if (bossIntroT > 0) bossIntroT -= dt;
  // 環境音樂：進入遊戲即啟動，依區域/戰鬥切換氛圍
  if (state === 'play') {
    Music.ensure();
    const inBattle = enemies.some(e => e.kind === 'boss' && e.aggro && !e.dead);
    Music.setMood(inBattle ? 'battle' : player.x < 214 * TILE ? 'cave' : player.x < 366 * TILE ? 'water' : 'ruin');
    Music.update(dt);
  }
  // 地圖平移
  if (mapOpen) {
    const ps = 70 * dt;
    if (keys.ArrowLeft) mapPanX -= ps;
    if (keys.ArrowRight) mapPanX += ps;
    if (keys.ArrowUp) mapPanY -= ps;
    if (keys.ArrowDown) mapPanY += ps;
    mapPanX = clamp(mapPanX, 0, L.W); mapPanY = clamp(mapPanY, 0, L.H);
  }
  if (state === 'play' && !paused && !overlayOpen && !mapOpen) {
    playTime += dt;
    markExplored();
    updatePlayer(dt);
    for (const e of enemies) updateEnemy(e, dt);
    enemies = enemies.filter(e => !e.dead);
    updateWorld(dt);
  }
  // 攝影機
  const tx = clamp(cx(player) - VW / 2, 0, WORLD_W - VW);
  const ty = clamp(cy(player) - VH / 2 - 40, 0, WORLD_H - VH);
  cam.x += (tx - cam.x) * Math.min(1, dt * 8);
  cam.y += (ty - cam.y) * Math.min(1, dt * 8);
  render();
  if (!manualStep) requestAnimationFrame(frame);
}

initWorld();
cam.x = clamp(cx(player) - VW / 2, 0, WORLD_W - VW);
cam.y = clamp(cy(player) - VH / 2 - 40, 0, WORLD_H - VH);
requestAnimationFrame(frame);

// 除錯掛鉤（隱藏分頁時 rAF 不觸發，供自動化測試手動推進）
window.RingWalker = {
  step(ms) { manualStep = true; frame(lastTime + (ms || 16.7)); },
  resume() { if (manualStep) { manualStep = false; lastTime = performance.now(); requestAnimationFrame(frame); } },
  debug: {
    get state() { return state; },
    player,
    enemies: () => enemies,
    barriers: () => barriers,
    messages: () => messages,
    deadBosses: () => Array.from(deadBosses),
    music: () => ({ started: Music.started, mood: Music.mood }),
  },
};
})();
