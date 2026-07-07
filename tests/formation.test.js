'use strict';
// 陣法規則引擎測試 —— node tests/formation.test.js
const F = require('../js/formation.js');

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; }
  else { fail++; console.log('FAIL: ' + label + '\n  expect ' + b + '\n  actual ' + a); }
}

const 火 = 'fire', 水 = 'water', 風 = 'wind', 土 = 'earth';

// --- 克制關係（水克火、土克水、風克土、火克風）---
eq(F.counterOf(火), 水, '水克火');
eq(F.counterOf(水), 土, '土克水');
eq(F.counterOf(土), 風, '風克土');
eq(F.counterOf(風), 火, '火克風');

// --- 相鄰合法性（文件第三節對照表）---
eq([F.canFollow(火, 土), F.canFollow(火, 風)], [true, true], '火可接 土風');
eq([F.canFollow(水, 火), F.canFollow(水, 風)], [true, true], '水可接 火風');
eq([F.canFollow(土, 水), F.canFollow(土, 火)], [true, true], '土可接 水火');
eq([F.canFollow(風, 土), F.canFollow(風, 水)], [true, true], '風可接 土水');
eq(F.canFollow(火, 水), false, '火不可接水');
eq(F.canFollow(火, 火), false, '同元素不可相鄰');

// --- 文件範例：間接元素 ---
// 火→土→水：土是間接元素，有效為 火、水
let a = F.analyze([火, 土, 水]);
eq(a.effective, [火, 水], '火土水 有效元素');
eq(a.bridges, [土], '火土水 間接元素');
eq(a.backlash, false, '火土水 無反噬');

// 火→土→水→風→土：土(第2)與風(第4)為間接，有效為 火、水、土
a = F.analyze([火, 土, 水, 風, 土]);
eq(a.effective, [火, 水, 土], '火土水風土 有效元素');
eq(a.bridges, [土, 風], '火土水風土 間接元素');
eq(a.backlash, false, '間接元素不同元素 → 無反噬');

// 同元素夾中間：中間不算間接
a = F.analyze([土, 火, 土, 水]);
eq(a.bridges.includes(火), false, '土火土 中的火不是間接元素');

// --- 反噬：兩個以上同元素間接 ---
a = F.analyze([火, 風, 水, 風, 土]);
eq(a.bridges, [風, 風], '火風水風土 兩個風皆間接');
eq(a.backlash, true, '火風水風土 構成反噬');
eq(a.effective, [火, 水, 土], '火風水風土 有效元素');

// --- 驗證（合法序列）---
eq(F.validate([火, 土]), null, '火土 合法');
eq(F.validate([水, 風]), null, '水風 合法');
eq(F.validate([火, 風, 土]), null, '火風土 合法');
eq(F.validate([水, 火, 風]), null, '水火風 合法');
eq(F.validate([土, 水, 火]), null, '土水火 合法');
eq(F.validate([風, 土, 水]), null, '風土水 合法');
eq(F.validate([火, 土, 水]), null, '火土水 合法');
eq(F.validate([水, 火, 土]), null, '水火土 合法');
eq(F.validate([土, 水, 風]), null, '土水風 合法');
eq(F.validate([風, 土, 火]), null, '風土火 合法');
eq(F.validate([火, 風, 水, 風, 土]), null, '反噬大陣 合法');
eq(F.validate([土, 水, 風, 土, 火]), null, '深層結界 合法');

// --- 驗證（不合法）---
eq(F.validate([火, 水]) !== null, true, '火水 不合法（水克火）');
eq(F.validate([火, 火]) !== null, true, '火火 不合法（同元素）');
eq(F.validate([火, 風]) !== null, true, '火風 閉合失敗（火克風）');
eq(F.validate([火]) !== null, true, '單元素無法成圓');

// --- 12 組建議輸入 → 主效果＋修飾 ---
function combo(seq) { const an = F.analyze(seq); return [an.effective[0], an.effective[1] || null]; }
eq(combo([火, 土, 水]), [火, 水], '1-4-2 → 延燒 火/水');
eq(combo([火, 土]), [火, 土], '1-4 → 火種 火/土');
eq(combo([火, 風, 土]), [火, 風], '1-3-4 → 追蹤 火/風');
eq(combo([水, 火, 風]), [水, 火], '2-1-3 → 爆療 水/火');
eq(combo([水, 風]), [水, 風], '2-3 → 流療 水/風');
eq(combo([水, 火, 土]), [水, 土], '2-1-4 → 泉湧 水/土');
eq(combo([土, 火]), [土, 火], '4-1 → 爆破 土/火');
eq(combo([土, 水, 火]), [土, 水], '4-2-1 → 回復 土/水');
eq(combo([土, 水, 風]), [土, 風], '4-2-3 → 感應 土/風');
eq(combo([風, 土, 火]), [風, 火], '3-4-1 → 衝刺 風/火');
eq(combo([風, 水]), [風, 水], '3-2 → 流體 風/水');
eq(combo([風, 土, 水]), [風, 土], '3-4-2 → 錨點 風/土');

// --- 破陣序列（文件範例：火→風→土 → 水→火→風）---
eq(F.breakSeqOf([火, 風, 土]), [水, 火, 風], '破陣序列轉換');
eq(F.matchesRotation([水, 火, 風], [水, 火, 風]), true, '破陣完全相符');
eq(F.matchesRotation([火, 風, 水], [水, 火, 風]), true, '旋轉一格也相符（圓無正面）');
eq(F.matchesRotation([風, 火, 水], [水, 火, 風]), false, '順序錯誤不相符');
eq(F.matchesRotation([水, 火], [水, 火, 風]), false, '長度不同不相符');

// 遊戲內兩道結界與敵陣的破陣序列
eq(F.breakSeqOf([土, 火]), [風, 水], '結界一 土火 → 風水');
eq(F.breakSeqOf([土, 水, 風, 土, 火]), [風, 土, 火, 風, 水], '結界二 → 風土火風水');
eq(F.breakSeqOf([火, 風, 土]), [水, 火, 風], '咒師追蹤陣 → 水火風');
eq(F.breakSeqOf([火, 風, 水, 風, 土]), [水, 火, 土, 火, 風], '頭目反噬陣 → 水火土火風');
// 破陣序列本身也必為合法陣（克制映射保持合法性）
eq(F.validate(F.breakSeqOf([土, 水, 風, 土, 火])), null, '結界二破陣序列自身合法');
eq(F.validate(F.breakSeqOf([火, 風, 水, 風, 土])), null, '反噬陣破陣序列自身合法');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
