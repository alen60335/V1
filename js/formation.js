'use strict';
// ============================================================
// 陣法規則引擎 —— 依《陣法系統設計文件》實作
// 元素克制：水克火、土克水、風克土、火克風
// ============================================================
const Formation = (() => {

  const INFO = {
    fire:  { key: 'fire',  name: '火', color: '#ff6238', glow: '#ffb27a', counter: 'water' },
    water: { key: 'water', name: '水', color: '#3fa8ff', glow: '#a8dcff', counter: 'earth' },
    wind:  { key: 'wind',  name: '風', color: '#4fe0a0', glow: '#c2ffd9', counter: 'fire'  },
    earth: { key: 'earth', name: '土', color: '#d9a441', glow: '#f2d49b', counter: 'wind'  },
  };
  const ELEMENTS = ['fire', 'water', 'wind', 'earth'];

  // 回傳「克制 e」的元素（counterOf('fire') === 'water'，因為水克火）
  const counterOf = (e) => INFO[e].counter;

  // b 是否可以接在 a 之後：不能同元素、b 不能克 a
  const canFollow = (a, b) => a !== b && b !== counterOf(a);

  // 逐步輸入檢查：合法回傳 null，否則回傳原因文字
  function checkAppend(seq, next) {
    if (seq.length === 0) return null;
    const last = seq[seq.length - 1];
    if (last === next) return '同元素不能相鄰';
    if (next === counterOf(last)) return INFO[next].name + '克' + INFO[last].name + '，不能接續';
    return null;
  }

  // 圓形閉合檢查（起陣前）：合法回傳 null
  function checkClosure(seq) {
    if (seq.length < 2) return '陣法至少需要兩個元素';
    const last = seq[seq.length - 1], first = seq[0];
    if (last === first) return '尾端與開頭同元素，無法閉合成圓';
    if (!canFollow(last, first)) return '尾端 ' + INFO[last].name + ' 無法接回開頭 ' + INFO[first].name;
    return null;
  }

  // 間接元素判定＋反噬判定
  // 掃描三元組 (a,b,c)：若 a≠c 且 c 不能直接接在 a 之後（克制關係），b 即為間接元素
  function analyze(seq) {
    const items = seq.map((e, i) => ({ e, i, bridge: false }));
    const list = items.slice();
    let i = 0;
    while (i + 2 < list.length) {
      const a = list[i], b = list[i + 1], c = list[i + 2];
      if (a.e !== c.e && !canFollow(a.e, c.e)) {
        b.bridge = true;
        list.splice(i + 1, 1); // 透明化，不參與後續判定；留在原位重新檢查新三元組
      } else {
        i++;
      }
    }
    const effective = list.map(x => x.e);
    const bridges = items.filter(x => x.bridge).map(x => x.e);
    const backlash = bridges.length >= 2 && bridges.every(e => e === bridges[0]);
    return {
      effective,
      bridges,
      bridgeIndices: items.filter(x => x.bridge).map(x => x.i),
      backlash,
    };
  }

  // 完整驗證（給 AI 陣型與測試用）
  function validate(seq) {
    for (let k = 1; k < seq.length; k++) {
      const err = checkAppend(seq.slice(0, k), seq[k]);
      if (err) return err;
    }
    return checkClosure(seq);
  }

  // 破陣序列：把對方序列中每個元素換成克制它的元素
  const breakSeqOf = (seq) => seq.map(counterOf);

  // 陣是圓、會旋轉、沒有正面 —— 輸入等於目標的任一旋轉即算符合
  function matchesRotation(input, target) {
    if (!input || !target || input.length !== target.length || input.length === 0) return false;
    for (let s = 0; s < target.length; s++) {
      let ok = true;
      for (let k = 0; k < target.length; k++) {
        if (input[k] !== target[(s + k) % target.length]) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  // 施展窗口長度：越長的陣，窗口越久（越容易被破）
  const castTime = (len) => 0.4 + 0.35 * len;

  return { INFO, ELEMENTS, counterOf, canFollow, checkAppend, checkClosure, analyze, validate, breakSeqOf, matchesRotation, castTime };
})();

if (typeof module !== 'undefined') module.exports = Formation;
