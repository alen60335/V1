'use strict';
// ============================================================
// 關卡資料 —— 洞窟世界（240 x 40 格，每格 32px）
// 格值：0 空氣、1 岩石、2 尖刺
// ============================================================
const Level = (() => {
  const W = 240, H = 40, TILE = 32;
  const grid = new Uint8Array(W * H).fill(1);

  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 1 : grid[y * W + x];
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) grid[y * W + x] = v; };
  function carve(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, 0); }
  function fill(x0, y0, x1, y1, v) { const vv = (v === undefined) ? 1 : v; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, vv); }

  // ---- 房間雕刻（主地面在第 32 列，即 y>=32 為地）----
  carve(2, 20, 38, 31);      // 1. 起始洞窟
  carve(38, 24, 70, 31);     // 2. 走廊
  carve(70, 18, 92, 31);     // 3. 結界室一
  carve(92, 20, 131, 31);    // 4. 裂谷室
  carve(131, 18, 152, 31);   // 5. 祭壇室
  carve(152, 18, 186, 31);   // 6. 咒師走廊
  carve(186, 14, 214, 31);   // 7. 深層陣殿（頭目）

  // 裂谷：往下挖、底部尖刺、中央踏台
  carve(104, 32, 116, 35);
  fill(104, 35, 116, 35, 2);   // 尖刺列
  fill(108, 33, 111, 33, 1);   // 中央踏台（頂面低於兩側地面一格）

  // 咒師走廊的平台
  fill(158, 28, 162, 28);      // 咒師甲平台
  fill(173, 26, 177, 26);      // 咒師乙平台
  // 通往高處寶物的階梯平台
  fill(165, 28, 167, 28);
  fill(170, 25, 172, 25);
  fill(175, 22, 177, 22);
  fill(180, 20, 183, 20);      // 陣槽玉平台

  // ---- 物件與生成點（x 為格座標；floor 為腳下地面那一列）----
  const spawns = {
    player: { x: 5, floor: 32 },
    signs: [
      { x: 8,  floor: 32, text: '←→ 移動，X 跳躍，C 法杖揮擊。' },
      { x: 17, floor: 32, text: '按 A火 S水 D風 F土 輸入元素，Space 起陣。同元素不能相鄰；被克元素不能接續（水克火・土克水・風克土・火克風）。序列首尾必須接成圓。' },
      { x: 26, floor: 32, text: '速成陣式——「A F」火土＝火種（燃燒地帶）；「D S」風水＝流體位移。按 Tab 查看全部陣式。' },
      { x: 44, floor: 32, text: '速陣快而弱，強陣強而慢。施展窗口越長，越容易被人破陣。' },
      { x: 76, floor: 32, text: '結界擋路！破陣＝把對方每個元素換成克制它的元素。此陣為 土→火；風克土、水克火，故破陣序列為「風 水」。站到結界前，按 Shift 進入破陣模式，輸入 D、S，再按 Space 發動。' },
      { x: 98, floor: 32, text: '裂谷太寬，跳不過去。風系陣法可以位移——「D S」風水＝流體位移，或「D F A」風土火＝衝刺（土是間接元素，只作橋接）。空中也能起陣。' },
      { x: 154, floor: 32, text: '前方有咒師。他們佈陣時序列清晰可見——趁其起陣之前，按 Shift 進入破陣模式，輸入克制序列後 Space 破其陣！注意：反噬陣被破會反傷（陣圈完成時，陣心會呈暗紅色）。' },
      { x: 183, floor: 32, text: '深層結界，五元素成陣。逐一以克制元素替換即可。陣槽不足者，先去尋得陣槽玉。' },
    ],
    walkers: [
      { x: 31, floor: 32 }, { x: 48, floor: 32 }, { x: 60, floor: 32 },
      { x: 157, floor: 32 }, { x: 168, floor: 32 }, { x: 196, floor: 32 },
    ],
    casters: [
      { x: 160, floor: 28, pool: [['fire', 'wind', 'earth']] },                       // 追蹤火彈
      { x: 175, floor: 26, pool: [['fire', 'earth'], ['fire', 'wind', 'earth']] },    // 火種＋追蹤
    ],
    boss: { x: 203, floor: 32 },
    pickups: [
      { x: 141, floor: 32, type: 'slot' },   // 祭壇室：陣槽玉一
      { x: 181, floor: 20, type: 'slot' },   // 高台：陣槽玉二
      { x: 110, floor: 33, type: 'mana' },   // 裂谷踏台：靈力玉
    ],
    checkpoints: [
      { x: 136, floor: 32 },
      { x: 190, floor: 32 },
    ],
    barriers: [
      { x: 84,  y0: 18, y1: 31, seq: ['earth', 'fire'] },                              // 破陣＝風水
      { x: 186, y0: 14, y1: 31, seq: ['earth', 'water', 'wind', 'earth', 'fire'] },    // 破陣＝風土火風水
    ],
    goal: { x: 210, floor: 32 },
  };

  return { W, H, TILE, at, set, spawns };
})();

if (typeof module !== 'undefined') module.exports = Level;
