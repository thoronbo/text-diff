/*!
 * 文本对比 Text Diff — 界面逻辑
 * Copyright (c) 2026 深维工坊工作室 Deep Dimension Workshop
 * Released under the MIT License.
 */
(function () {
  'use strict';

  var Core = window.DiffCore;
  var byId = function (id) { return document.getElementById(id); };

  var el = {
    textA: byId('text-a'),
    textB: byId('text-b'),
    countA: byId('count-a'),
    countB: byId('count-b'),
    ignoreCase: byId('ignore-case'),
    ignoreSpace: byId('ignore-space'),
    copyBtn: byId('copy-btn'),
    swapBtn: byId('swap-btn'),
    sampleBtn: byId('sample-btn'),
    statbar: byId('statbar'),
    diff: byId('diff'),
    resultNote: byId('result-note'),
    actionNote: byId('action-note')
  };

  var MAX_ROWS = 4000;
  var renderTimer = 0;
  var flashTimer = 0;
  var lastResult = null;

  var SAMPLE_A = [
    'function greet(name) {',
    '  console.log("Hello, " + name);',
    '  return true;',
    '}',
    '',
    'const users = ["Ada", "Linus"];',
    'users.forEach(greet);'
  ].join('\n');

  var SAMPLE_B = [
    'function greet(name, greeting) {',
    '  console.log(greeting + ", " + name + "!");',
    '  return true;',
    '}',
    '',
    'const users = ["Ada", "Linus", "Grace"];',
    'users.forEach(function (user) {',
    '  greet(user, "Hello");',
    '});'
  ].join('\n');

  function flash(message) {
    el.actionNote.textContent = message;
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(function () {
      el.actionNote.textContent = '';
    }, 2200);
  }

  function schedule() {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(render, 180);
  }

  function render() {
    var textA = el.textA.value;
    var textB = el.textB.value;

    el.countA.textContent = Core.splitLines(textA).length + ' 行';
    el.countB.textContent = Core.splitLines(textB).length + ' 行';

    if (!textA && !textB) {
      lastResult = null;
      el.diff.innerHTML = '';
      var empty = document.createElement('div');
      empty.className = 'diff-empty';
      empty.textContent = '两边都填上内容后，差异会显示在这里。';
      el.diff.appendChild(empty);
      renderStats(null);
      el.resultNote.textContent = '两边都填上内容后，差异会显示在这里';
      return;
    }

    var result = Core.compare(textA, textB, {
      ignoreCase: el.ignoreCase.checked,
      ignoreWhitespace: el.ignoreSpace.checked
    });

    lastResult = result;
    renderStats(result);
    renderRows(result);
    renderNote(result);
  }

  function renderStats(result) {
    el.statbar.innerHTML = '';
    if (!result) {
      var idle = document.createElement('span');
      idle.className = 's-same';
      idle.textContent = '等待内容';
      el.statbar.appendChild(idle);
      return;
    }

    var items = [
      { cls: 's-add', text: '+' + result.stats.added + ' 新增' },
      { cls: 's-del', text: '−' + result.stats.removed + ' 删除' },
      { cls: 's-mod', text: '~' + result.stats.modified + ' 修改' },
      { cls: 's-same', text: result.stats.unchanged + ' 行未变' }
    ];

    for (var i = 0; i < items.length; i++) {
      var span = document.createElement('span');
      span.className = items[i].cls;
      span.textContent = items[i].text;
      el.statbar.appendChild(span);
    }
  }

  function renderNote(result) {
    if (!result.stats.added && !result.stats.removed && !result.stats.modified) {
      el.resultNote.textContent = '两边内容一致，没有发现差异';
      return;
    }
    var changed = result.stats.removed + result.stats.added;
    el.resultNote.textContent = '共 ' + changed + ' 处改动，左侧为原文，右侧为新文';
  }

  function renderRows(result) {
    var frag = document.createDocumentFragment();
    var rows = result.rows;
    var limit = Math.min(rows.length, MAX_ROWS);

    for (var i = 0; i < limit; i++) {
      frag.appendChild(buildRow(rows[i]));
    }

    el.diff.innerHTML = '';
    el.diff.appendChild(frag);

    if (rows.length > MAX_ROWS) {
      var more = document.createElement('div');
      more.className = 'diff-empty';
      more.textContent = '内容较长，列表只显示前 ' + MAX_ROWS + ' 行；复制差异会包含完整结果。';
      el.diff.appendChild(more);
    }
  }

  function buildRow(row) {
    var line = document.createElement('div');
    line.className = 'drow is-' + row.type;
    line.appendChild(buildSide(row.left, 'left', row));
    line.appendChild(buildSide(row.right, 'right', row));
    return line;
  }

  function buildSide(side, which, row) {
    var box = document.createElement('div');
    box.className = 'side ' + which;

    var no = document.createElement('span');
    no.className = 'no';
    no.textContent = side ? String(side.no) : '';

    var mark = document.createElement('span');
    mark.className = 'mark';

    var code = document.createElement('code');

    if (side) {
      if (which === 'left' && (row.type === 'removed' || row.type === 'change')) mark.textContent = '−';
      if (which === 'right' && (row.type === 'added' || row.type === 'change')) mark.textContent = '+';

      if (side.segments) {
        for (var i = 0; i < side.segments.length; i++) {
          var seg = side.segments[i];
          var span = document.createElement('span');
          span.className = 'seg-' + seg.type;
          span.textContent = seg.text;
          code.appendChild(span);
        }
      } else {
        code.textContent = side.text;
      }
    }

    box.appendChild(no);
    box.appendChild(mark);
    box.appendChild(code);
    return box;
  }

  function copyDiff() {
    if (!lastResult) return;
    var text = Core.toUnified(lastResult, '原文', '新文');
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        flash('差异已复制');
      }, legacyCopy);
    } else {
      legacyCopy();
    }

    function legacyCopy() {
      var box = document.createElement('textarea');
      box.value = text;
      box.style.position = 'fixed';
      box.style.top = '0';
      box.style.opacity = '0';
      document.body.appendChild(box);
      box.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(box);
      flash(ok ? '差异已复制' : '复制没有成功，请手动选择内容');
    }
  }

  function swap() {
    var a = el.textA.value;
    el.textA.value = el.textB.value;
    el.textB.value = a;
    render();
    flash('已交换两边内容');
  }

  function loadSample() {
    el.textA.value = SAMPLE_A;
    el.textB.value = SAMPLE_B;
    render();
    flash('已载入示例');
  }

  el.textA.addEventListener('input', schedule);
  el.textB.addEventListener('input', schedule);
  el.ignoreCase.addEventListener('change', render);
  el.ignoreSpace.addEventListener('change', render);
  el.copyBtn.addEventListener('click', copyDiff);
  el.swapBtn.addEventListener('click', swap);
  el.sampleBtn.addEventListener('click', loadSample);

  render();
})();
