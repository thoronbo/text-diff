/*!
 * 文本对比 Text Diff — 核心算法测试
 * Copyright (c) 2026 深维工坊工作室 Deep Dimension Workshop
 * Released under the MIT License.
 *
 * 运行：node test/diff.test.js
 */
'use strict';

var assert = require('assert');
var core = require('../assets/js/diff-core.js');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (err) {
    failed++;
    console.log('  FAIL ' + name);
    console.log('       ' + err.message);
  }
}

function group(name) { console.log('\n' + name); }

function rebuild(ops, a, b, side) {
  var out = [];
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    if (side === 'a') {
      if (op.type === 'equal') out.push(a[op.a]);
      else if (op.type === 'delete') out.push(a[op.a]);
    } else {
      if (op.type === 'equal') out.push(b[op.b]);
      else if (op.type === 'insert') out.push(b[op.b]);
    }
  }
  return out;
}

function lcsLength(a, b) {
  var dp = [];
  for (var i = 0; i <= a.length; i++) {
    dp.push(new Array(b.length + 1).fill(0));
  }
  for (var x = 1; x <= a.length; x++) {
    for (var y = 1; y <= b.length; y++) {
      dp[x][y] = a[x - 1] === b[y - 1]
        ? dp[x - 1][y - 1] + 1
        : Math.max(dp[x - 1][y], dp[x][y - 1]);
    }
  }
  return dp[a.length][b.length];
}

group('Myers 差分');

test('两边都为空', function () {
  assert.deepStrictEqual(core.diff([], []), []);
});

test('完全相同', function () {
  var ops = core.diff(['a', 'b', 'c'], ['a', 'b', 'c']);
  assert.strictEqual(ops.length, 3);
  assert.ok(ops.every(function (op) { return op.type === 'equal'; }));
});

test('全部删除', function () {
  var ops = core.diff(['a', 'b'], []);
  assert.strictEqual(ops.filter(function (o) { return o.type === 'delete'; }).length, 2);
});

test('全部新增', function () {
  var ops = core.diff([], ['x', 'y']);
  assert.strictEqual(ops.filter(function (o) { return o.type === 'insert'; }).length, 2);
});

test('中间删除一行', function () {
  var ops = core.diff(['a', 'b', 'c'], ['a', 'c']);
  assert.strictEqual(ops.filter(function (o) { return o.type === 'delete'; }).length, 1);
  assert.strictEqual(ops.filter(function (o) { return o.type === 'equal'; }).length, 2);
});

test('中间插入一行', function () {
  var ops = core.diff(['a', 'c'], ['a', 'b', 'c']);
  assert.strictEqual(ops.filter(function (o) { return o.type === 'insert'; }).length, 1);
});

test('替换一行', function () {
  var ops = core.diff(['a', 'b'], ['a', 'z']);
  assert.strictEqual(ops.filter(function (o) { return o.type === 'delete'; }).length, 1);
  assert.strictEqual(ops.filter(function (o) { return o.type === 'insert'; }).length, 1);
});

test('操作序列能完整还原两边原文', function () {
  var a = 'the quick brown fox'.split(' ');
  var b = 'the lazy brown dog jumps'.split(' ');
  var ops = core.diff(a, b);
  assert.strictEqual(rebuild(ops, a, b, 'a').join(' '), a.join(' '));
  assert.strictEqual(rebuild(ops, a, b, 'b').join(' '), b.join(' '));
});

test('随机数据与最长公共子序列长度一致', function () {
  var alphabet = ['a', 'b', 'c', 'd'];
  var seed = 20261111;

  function random() {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  }

  for (var round = 0; round < 120; round++) {
    var na = Math.floor(random() * 24);
    var nb = Math.floor(random() * 24);
    var a = [];
    var b = [];
    for (var i = 0; i < na; i++) a.push(alphabet[Math.floor(random() * alphabet.length)]);
    for (var j = 0; j < nb; j++) b.push(alphabet[Math.floor(random() * alphabet.length)]);

    var ops = core.diff(a, b);
    var equalCount = ops.filter(function (op) { return op.type === 'equal'; }).length;
    assert.strictEqual(equalCount, lcsLength(a, b), '第 ' + round + ' 组长度不一致');
    assert.strictEqual(rebuild(ops, a, b, 'a').join(''), a.join(''), '第 ' + round + ' 组左侧还原失败');
    assert.strictEqual(rebuild(ops, a, b, 'b').join(''), b.join(''), '第 ' + round + ' 组右侧还原失败');
  }
});

group('逐行对比');

test('统计新增、删除与修改', function () {
  var result = core.compare(
    'const a = 1;\nconst b = 2;\n',
    'const a = 1;\nconst b = 3;\nconst c = 4;\n',
    {}
  );
  assert.strictEqual(result.stats.unchanged, 1);
  assert.strictEqual(result.stats.modified, 1);
  assert.strictEqual(result.stats.added, 2);
  assert.strictEqual(result.stats.removed, 1);
});

test('行号从 1 开始且保持对齐', function () {
  var result = core.compare('a\nb', 'a\nx\ny', {});
  assert.strictEqual(result.rows[0].left.no, 1);
  assert.strictEqual(result.rows[0].right.no, 1);
  assert.strictEqual(result.rows[1].left.no, 2);
  assert.strictEqual(result.rows[1].right.no, 2);
});

test('忽略空白后视为相同', function () {
  var result = core.compare('  hello   world  \n', 'hello world\n', { ignoreWhitespace: true });
  assert.strictEqual(result.stats.modified, 0);
  assert.strictEqual(result.stats.added, 0);
});

test('忽略大小写后视为相同', function () {
  var result = core.compare('Hello\n', 'hello\n', { ignoreCase: true });
  assert.strictEqual(result.stats.unchanged, 1);
});

test('默认区分大小写', function () {
  var result = core.compare('Hello\n', 'hello\n', {});
  assert.strictEqual(result.stats.modified, 1);
});

test('兼容 CRLF', function () {
  var result = core.compare('a\r\nb\r\n', 'a\r\nb\r\n', {});
  assert.strictEqual(result.stats.unchanged, 2);
});

test('完全相同时没有差异行', function () {
  var result = core.compare('a\nb\nc', 'a\nb\nc', {});
  assert.strictEqual(result.stats.added, 0);
  assert.strictEqual(result.stats.removed, 0);
});

group('字符级高亮');

test('替换字符时只标出变化部分', function () {
  var segs = core.charSegments('const a = 1;', 'const a = 2;');
  var left = segs.left.map(function (s) { return s.text; }).join('');
  var right = segs.right.map(function (s) { return s.text; }).join('');
  assert.strictEqual(left, 'const a = 1;');
  assert.strictEqual(right, 'const a = 2;');
  assert.ok(segs.left.some(function (s) { return s.type === 'delete' && s.text === '1'; }));
  assert.ok(segs.right.some(function (s) { return s.type === 'insert' && s.text === '2'; }));
});

test('超长行退化为整行标记', function () {
  var left = new Array(2000).join('a');
  var right = new Array(2000).join('b');
  var segs = core.charSegments(left, right);
  assert.strictEqual(segs.left.length, 1);
  assert.strictEqual(segs.left[0].type, 'delete');
});

group('导出为统一差异文本');

test('生成带标记的差异文本', function () {
  var result = core.compare('a\nb\nc', 'a\nx\nc', {});
  var text = core.toUnified(result);
  assert.ok(text.indexOf('--- 原文') === 0);
  assert.ok(text.indexOf('- b') > -1);
  assert.ok(text.indexOf('+ x') > -1);
});

test('没有差异时给出提示', function () {
  var result = core.compare('same', 'same', {});
  assert.ok(core.toUnified(result).indexOf('没有差异') > -1);
});

/* ------------------------------------------------------------------ */

console.log('\n' + passed + ' 通过，' + failed + ' 失败');
if (failed > 0) process.exitCode = 1;
