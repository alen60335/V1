'use strict';
// ============================================================
// 素材載入層 —— 圖片載入成功就用圖，失敗則遊戲自動 fallback 回程式化繪製
// 圖片由本機 Stable Diffusion（Forge / AOM3A3）生成，放在 assets/
// ============================================================
const Assets = (() => {
  const defs = {
    bgCave: 'assets/bg_cave.png',
    titleScene: 'assets/title_scene.png',
    bossPortrait: 'assets/boss_portrait.png',
    playerPortrait: 'assets/player_portrait.png',
  };
  const img = {};
  const ok = {};
  for (const k in defs) {
    const im = new Image();
    im.onload = () => { ok[k] = true; };
    im.onerror = () => { ok[k] = false; };
    im.src = defs[k];
    img[k] = im;
  }
  // 是否可安全繪製（載入完成且有實際尺寸）
  const has = (k) => ok[k] === true && img[k].complete && img[k].naturalWidth > 0;
  return { img, has };
})();

if (typeof module !== 'undefined') module.exports = Assets;
