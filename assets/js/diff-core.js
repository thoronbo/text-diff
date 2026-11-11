/*!
 * 文本对比 Text Diff — 核心算法
 * Copyright (c) 2026 深维工坊工作室 Deep Dimension Workshop
 * Released under the MIT License.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DiffCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_CHAR_DIFF = 1600;

  /* ------------------------------------------------------------------ *
   * Myers 差分：返回 equal / delete / insert 操作序列
   * ------------------------------------------------------------------ */

  function diff(a, b) {
    var n = a.length;
    var m = b.length;
    var ops = [];

    if (n === 0 && m === 0) return ops;
    if (n === 0) {
      for (var y0 = 0; y0 < m; y0++) ops.push({ type: 'insert', b: y0 });
      return ops;
    }
    if (m === 0) {
      for (var x0 = 0; x0 < n; x0++) ops.push({ type: 'delete', a: x0 });
      return ops;
    }

    var max = n + m;
    var offset = max + 1;
    var size = 2 * max + 3;
    var v = new Int32Array(size).fill(-1);
    v[offset + 1] = 0;

    var trace = [];
    var found = -1;

    for (var d = 0; d <= max && found < 0; d++) {
      trace.push(v.slice());
      for (var k = -d; k <= d; k += 2) {
        var x;
        if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
          x = v[offset + k + 1];
        } else {
          x = v[offset + k - 1] + 1;
        }
        var y = x - k;
        while (x < n && y < m && a[x] === b[y]) { x++; y++; }
        v[offset + k] = x;
        if (x >= n && y >= m) { found = d; break; }
      }
    }

    if (found < 0) {
      for (var i = 0; i < n; i++) ops.push({ type: 'delete', a: i });
      for (var j = 0; j < m; j++) ops.push({ type: 'insert', b: j });
      return ops;
    }

    var cx = n;
    var cy = m;

    for (var level = found; level > 0; level--) {
      var snapshot = trace[level];
      var diagonal = cx - cy;
      var prevK;

      if (diagonal === -level ||
        (diagonal !== level && snapshot[offset + diagonal - 1] < snapshot[offset + diagonal + 1])) {
        prevK = diagonal + 1;
      } else {
        prevK = diagonal - 1;
      }

      var prevX = snapshot[offset + prevK];
      var prevY = prevX - prevK;

      while (cx > prevX && cy > prevY) {
        cx--; cy--;
        ops.push({ type: 'equal', a: cx, b: cy });
      }

      if (level > 0) {
        if (cx === prevX) {
          cy--;
          ops.push({ type: 'insert', b: cy });
        } else {
          cx--;
          ops.push({ type: 'delete', a: cx });
        }
      }
      cx = prevX;
      cy = prevY;
    }

    while (cx > 0 && cy > 0) {
      cx--; cy--;
      ops.push({ type: 'equal', a: cx, b: cy });
    }
    while (cx > 0) { cx--; ops.push({ type: 'delete', a: cx }); }
    while (cy > 0) { cy--; ops.push({ type: 'insert', b: cy }); }

    return ops.reverse();
  }

  /* ------------------------------------------------------------------ *
   * 行级比较
   * ------------------------------------------------------------------ */

  function normalize(text) {
    return String(text == null ? '' : text)
      .replace(/\uFEFF/g, '')
      .replace(/\r\n?/g, '\n');
  }

  function splitLines(text) {
    var value = normalize(text);
    if (value === '') return [];
    var lines = value.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines;
  }

  function lineKey(line, options) {
    var value = line;
    if (options.ignoreCase) value = value.toLowerCase();
    if (options.ignoreWhitespace) value = value.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    if (options.ignoreTrailingWhitespace) value = value.replace(/\s+$/, '');
    return value;
  }

  function prepare(lines, options) {
    var keys = new Array(lines.length);
    for (var i = 0; i < lines.length; i++) keys[i] = lineKey(lines[i], options);
    return keys;
  }

  function groupOps(ops) {
    var groups = [];
    var current = null;
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.type === 'equal') {
        current = null;
        groups.push({ type: 'equal', op: op });
        continue;
      }
      if (!current) {
        current = { type: 'change', deletes: [], inserts: [] };
        groups.push(current);
      }
      if (op.type === 'delete') current.deletes.push(op);
      else current.inserts.push(op);
    }
    return groups;
  }

  function pushSegment(list, type, text) {
    if (!text) return;
    var last = list[list.length - 1];
    if (last && last.type === type) last.text += text;
    else list.push({ type: type, text: text });
  }

  function charSegments(left, right) {
    var a = Array.from(left);
    var b = Array.from(right);
    if (a.length > MAX_CHAR_DIFF || b.length > MAX_CHAR_DIFF) {
      return { left: [{ type: 'delete', text: left }], right: [{ type: 'insert', text: right }] };
    }

    var ops = diff(a, b);
    var leftSegs = [];
    var rightSegs = [];

    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.type === 'equal') {
        pushSegment(leftSegs, 'equal', a[op.a]);
        pushSegment(rightSegs, 'equal', b[op.b]);
      } else if (op.type === 'delete') {
        pushSegment(leftSegs, 'delete', a[op.a]);
      } else {
        pushSegment(rightSegs, 'insert', b[op.b]);
      }
    }
    return { left: leftSegs, right: rightSegs };
  }

  function similarity(left, right) {
    if (!left.length && !right.length) return 1;
    var longer = Math.max(left.length, right.length);
    if (!longer) return 1;
    var same = 0;
    var shorter = Math.min(left.length, right.length);
    for (var i = 0; i < shorter; i++) if (left[i] === right[i]) same++;
    return same / longer;
  }

  function compare(textA, textB, options) {
    var opts = options || {};
    var linesA = splitLines(textA);
    var linesB = splitLines(textB);
    var keysA = prepare(linesA, opts);
    var keysB = prepare(linesB, opts);

    var ops = diff(keysA, keysB);
    var groups = groupOps(ops);

    var rows = [];
    var stats = { added: 0, removed: 0, modified: 0, unchanged: 0 };

    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];

      if (group.type === 'equal') {
        var eq = group.op;
        rows.push({
          type: 'equal',
          left: { no: eq.a + 1, text: linesA[eq.a] },
          right: { no: eq.b + 1, text: linesB[eq.b] }
        });
        stats.unchanged++;
        continue;
      }

      var deletes = group.deletes;
      var inserts = group.inserts;
      var paired = Math.min(deletes.length, inserts.length);

      for (var p = 0; p < paired; p++) {
        var leftText = linesA[deletes[p].a];
        var rightText = linesB[inserts[p].b];
        var segs = charSegments(leftText, rightText);
        rows.push({
          type: 'change',
          left: { no: deletes[p].a + 1, text: leftText, segments: segs.left },
          right: { no: inserts[p].b + 1, text: rightText, segments: segs.right }
        });
        stats.removed++;
        stats.added++;
        stats.modified++;
      }

      for (var d = paired; d < deletes.length; d++) {
        rows.push({
          type: 'removed',
          left: { no: deletes[d].a + 1, text: linesA[deletes[d].a] },
          right: null
        });
        stats.removed++;
      }

      for (var n = paired; n < inserts.length; n++) {
        rows.push({
          type: 'added',
          left: null,
          right: { no: inserts[n].b + 1, text: linesB[inserts[n].b] }
        });
        stats.added++;
      }
    }

    return {
      rows: rows,
      stats: stats,
      totalLeft: linesA.length,
      totalRight: linesB.length
    };
  }

  function toUnified(result, labelA, labelB) {
    var out = ['--- ' + (labelA || '原文'), '+++ ' + (labelB || '新文')];
    var i = 0;
    while (i < result.rows.length) {
      var row = result.rows[i];
      if (row.type === 'equal') { i++; continue; }
      out.push('@@ 第 ' + (row.left ? row.left.no : row.right.no) + ' 行 @@');
      while (i < result.rows.length && result.rows[i].type !== 'equal') {
        var r = result.rows[i];
        if (r.type === 'removed') out.push('- ' + r.left.text);
        else if (r.type === 'added') out.push('+ ' + r.right.text);
        else {
          out.push('- ' + r.left.text);
          out.push('+ ' + r.right.text);
        }
        i++;
      }
    }
    if (out.length === 2) out.push('（没有差异）');
    return out.join('\n');
  }

  function estimateSimilarity(leftText, rightText) {
    return similarity(Array.from(leftText), Array.from(rightText));
  }

  return {
    diff: diff,
    compare: compare,
    splitLines: splitLines,
    lineKey: lineKey,
    charSegments: charSegments,
    toUnified: toUnified,
    estimateSimilarity: estimateSimilarity
  };
});
