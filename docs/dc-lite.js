/*
 * dc-lite: a small runtime that renders the canvas's .dc.html design files as
 * ordinary web pages. It supports what those files use: {{holes}}, <sc-for>,
 * <sc-if>, onClick/onChange handlers, <helmet> head content, and a
 * `class Component extends DCLogic` script with state, setState and renderVals.
 */
(function () {
  var hide = document.createElement('style');
  hide.textContent = 'x-dc{display:none !important}';
  document.head.appendChild(hide);

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = Object.assign({}, this.state, next);
    if (this.__render) this.__render();
  };
  DCLogic.prototype.forceUpdate = function () {
    if (this.__render) this.__render();
  };
  window.DCLogic = DCLogic;

  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var PROPS = { value: 1, checked: 1, disabled: 1, selected: 1, readonly: 1 };

  function lookup(scopes, path) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^(['"]).*\1$/.test(path)) return path.slice(1, -1);
    var parts = path.split('.');
    for (var i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i] && Object.prototype.hasOwnProperty.call(scopes[i], parts[0])) {
        var v = scopes[i][parts[0]];
        for (var j = 1; j < parts.length && v != null; j++) v = v[parts[j]];
        return v;
      }
    }
    return undefined;
  }

  function interp(str, scopes) {
    return str.replace(HOLE, function (_, p) {
      var v = lookup(scopes, p);
      return v == null ? '' : String(v);
    });
  }

  function build(node, scopes, out) {
    if (node.nodeType === 3) {
      out.appendChild(document.createTextNode(interp(node.nodeValue, scopes)));
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.localName;
    if (tag === 'sc-for') {
      var list = lookup(scopes, (node.getAttribute('list') || '').replace(/[{}]/g, '')) || [];
      var as = node.getAttribute('as') || 'item';
      list.forEach(function (item, idx) {
        var scope = { $index: idx };
        scope[as] = item;
        kids(node, scopes.concat([scope]), out);
      });
      return;
    }
    if (tag === 'sc-if') {
      var cond = lookup(scopes, (node.getAttribute('value') || '').replace(/[{}]/g, ''));
      if (cond) kids(node, scopes, out);
      return;
    }
    if (tag === 'dc-import') {
      var def = registry[node.getAttribute('name')];
      if (!def) return;
      var cprops = {};
      Object.keys(def.defaults).forEach(function (k) { cprops[k] = def.defaults[k]; });
      Array.prototype.forEach.call(node.attributes, function (a) {
        if (a.name === 'name' || /^hint-/.test(a.name)) return;
        var mm = a.value.match(WHOLE);
        var key = a.name.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
        cprops[key] = mm ? lookup(scopes, mm[1]) : interp(a.value, scopes);
      });
      // Keep each embedded component's instance (and so its state) across re-renders.
      var key = node.getAttribute('name') + '#' + (importCount++);
      var child = importCache[key];
      if (!child) {
        child = new def.Component(cprops);
        importCache[key] = child;
        if (child.componentDidMount) pendingMounts.push(child);
      }
      child.props = cprops;
      child.__render = currentRender;
      kids(def.tpl, [child.renderVals ? child.renderVals() : {}], out);
      return;
    }
    var el = node.namespaceURI === 'http://www.w3.org/2000/svg'
      ? document.createElementNS(node.namespaceURI, node.tagName)
      : document.createElement(tag);
    var late = [];
    Array.prototype.forEach.call(node.attributes, function (a) {
      var name = a.name;
      if (/^hint-/.test(name)) return;
      var m = a.value.match(WHOLE);
      if (/^on[a-z]+$/i.test(name)) {
        if (!m) return;
        var fn = lookup(scopes, m[1]);
        var ev = name.slice(2).toLowerCase();
        if (ev === 'change' && (tag === 'input' || tag === 'textarea')) {
          var t = (node.getAttribute('type') || '').toLowerCase();
          if (t !== 'checkbox' && t !== 'radio' && t !== 'date' && t !== 'time') ev = 'input';
        }
        if (typeof fn === 'function') el.addEventListener(ev, fn);
        return;
      }
      var val = m ? lookup(scopes, m[1]) : interp(a.value, scopes);
      if (PROPS[name] && m) {
        late.push([name, val]);
        return;
      }
      if (val === false && /^aria-/.test(name)) {
        el.setAttribute(name, 'false');
        return;
      }
      if (val === false || val == null) return;
      if (val === true) {
        el.setAttribute(name, /^aria-/.test(name) ? 'true' : '');
        return;
      }
      el.setAttribute(name, String(val));
    });
    kids(node, scopes, el);
    late.forEach(function (p) {
      var name = p[0];
      var val = p[1];
      if (name === 'value') el.value = val == null ? '' : val;
      else if (name === 'readonly') el.readOnly = !!val;
      else el[name] = !!val;
    });
    out.appendChild(el);
  }

  function kids(node, scopes, out) {
    var src = node.content || node;
    Array.prototype.forEach.call(src.childNodes, function (c) {
      build(c, scopes, out);
    });
  }

  var registry = {};
  var currentRender = null;
  var importCache = {};
  var importCount = 0;
  var pendingMounts = [];
  var seenHead = {};

  // Where the focused field sits in the page, so it can be focused again after a re-render.
  function focusPath(root, el) {
    if (!el || el === document.body || !root.contains(el)) return null;
    var path = [];
    for (var n = el; n && n !== root; n = n.parentNode) {
      path.unshift(Array.prototype.indexOf.call(n.parentNode.children, n));
    }
    return { path: path, start: el.selectionStart, end: el.selectionEnd };
  }
  function findPath(root, keep) {
    var n = root;
    for (var i = 0; n && i < keep.path.length; i++) n = n.children[keep.path[i]];
    return n;
  }

  // Put the new render in place. Embedded frames marked data-keep (maps) that
  // show the same page are carried over with moveBefore, so they don't reload
  // on every keystroke. Browsers without moveBefore just reload them.
  function swapIn(root, frag) {
    var keepers = {};
    if (root.moveBefore) {
      Array.prototype.forEach.call(root.querySelectorAll('iframe[data-keep]'), function (f) {
        keepers[f.getAttribute('data-keep') + ' ' + f.getAttribute('src')] = f;
      });
    }
    var matches = [];
    Array.prototype.forEach.call(frag.querySelectorAll('iframe[data-keep]'), function (f) {
      var old = keepers[f.getAttribute('data-keep') + ' ' + f.getAttribute('src')];
      if (old) {
        f.removeAttribute('src');
        matches.push([old, f]);
      }
    });
    if (!matches.length) {
      root.replaceChildren(frag);
      return;
    }
    var before = Array.prototype.slice.call(root.childNodes);
    root.appendChild(frag);
    matches.forEach(function (m) {
      m[1].parentNode.moveBefore(m[0], m[1]);
      m[1].remove();
    });
    before.forEach(function (n) { if (n.parentNode === root) n.remove(); });
  }

  function toHead(nodes) {
    Array.prototype.slice.call(nodes).forEach(function (n) {
      if (n.nodeType !== 1) return;
      var key = n.outerHTML;
      if (seenHead[key]) return;
      seenHead[key] = true;
      document.head.appendChild(n.cloneNode(true));
    });
  }

  function makeDef(host, scriptEl) {
    var helmet = host.querySelector('helmet');
    if (helmet) {
      toHead(helmet.childNodes);
      helmet.remove();
    }
    var tpl = document.createElement('template');
    tpl.innerHTML = host.innerHTML;
    var defaults = {};
    try {
      var decl = JSON.parse(scriptEl.getAttribute('data-props') || '{}');
      Object.keys(decl).forEach(function (k) {
        if (k.charAt(0) !== '$' && decl[k] && 'default' in decl[k]) defaults[k] = decl[k]['default'];
      });
    } catch (e) {}
    var Component = new Function('DCLogic', scriptEl.textContent + '\n;return Component;')(DCLogic);
    return { tpl: tpl, defaults: defaults, Component: Component };
  }

  function importNames(tpl) {
    return Array.prototype.map.call(tpl.content.querySelectorAll('dc-import'), function (n) {
      return n.getAttribute('name');
    });
  }

  function load(names) {
    var todo = names.filter(function (n, i) { return n && !registry[n] && names.indexOf(n) === i; });
    return Promise.all(todo.map(function (name) {
      return fetch(name + '.dc.html').then(function (r) { return r.text(); }).then(function (text) {
        var doc = new DOMParser().parseFromString(text, 'text/html');
        var host = doc.querySelector('x-dc');
        var scriptEl = doc.querySelector('script[data-dc-script]');
        if (!host || !scriptEl) return;
        registry[name] = makeDef(host, scriptEl);
        return load(importNames(registry[name].tpl));
      });
    }));
  }

  function mount() {
    var host = document.querySelector('x-dc');
    var scriptEl = document.querySelector('script[data-dc-script]');
    if (!host || !scriptEl) return;
    var def = makeDef(host, scriptEl);
    var comp = new def.Component(def.defaults);
    comp.props = def.defaults;
    var root = document.createElement('div');
    root.className = 'dc-root';
    host.parentNode.insertBefore(root, host);
    host.remove();
    comp.__render = function () {
      var keep = focusPath(root, document.activeElement);
      var frag = document.createDocumentFragment();
      currentRender = comp.__render;
      importCount = 0;
      kids(def.tpl, [comp.renderVals ? comp.renderVals() : {}], frag);
      swapIn(root, frag);
      pendingMounts.splice(0).forEach(function (c) { c.componentDidMount(); });
      if (keep) {
        var back = findPath(root, keep);
        if (back && back.focus) {
          back.focus();
          try { back.setSelectionRange(keep.start, keep.end); } catch (e) {}
        }
      }
    };
    load(importNames(def.tpl)).then(function () {
      comp.__render();
      if (comp.componentDidMount) comp.componentDidMount();
    });
  }

  // A screen opened on its own (not inside the main page) gets a small picker
  // pinned to the bottom, so you can always move to another screen.
  function addPicker() {
    if (window.top !== window) return;
    var s = document.createElement('script');
    s.src = '../screens.js';
    s.onload = function () {
      var groups = window.SCREEN_GROUPS || [];
      var here = (location.pathname.match(/([^/]+)\.dc\.html$/) || [])[1];
      var list = [];
      var bar = document.createElement('nav');
      bar.setAttribute('aria-label', 'Preview screens');
      bar.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:6px;max-width:calc(100vw - 24px);padding:6px;background:#18181a;border:1px solid #3a3a3e;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.45);font:600 14px Archivo,system-ui,sans-serif;color:#f2efe8';
      var btn = 'height:40px;min-width:40px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;background:transparent;color:#f2efe8;border:1px solid #3a3a3e;border-radius:3px;font:inherit;cursor:pointer;text-decoration:none;white-space:nowrap';
      var sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Screen');
      sel.style.cssText = 'height:40px;min-width:0;max-width:300px;padding:0 10px;background:#0d0d0e;color:#f2efe8;border:1px solid #3a3a3e;border-radius:3px;font:inherit';
      groups.forEach(function (g) {
        var og = document.createElement('optgroup');
        og.label = g[0];
        g[1].forEach(function (x) {
          var o = document.createElement('option');
          o.value = x[1];
          o.textContent = x[2];
          if (x[1] === here && !sel.dataset.done) { o.selected = true; sel.dataset.done = '1'; }
          og.appendChild(o);
          list.push(x[1]);
        });
        sel.appendChild(og);
      });
      function go(file) { location.href = file + '.dc.html'; }
      sel.addEventListener('change', function () { go(sel.value); });
      var i = Math.max(0, list.indexOf(here));
      var prev = document.createElement('button');
      prev.type = 'button';
      prev.textContent = '‹';
      prev.setAttribute('aria-label', 'Previous screen');
      prev.style.cssText = btn;
      prev.addEventListener('click', function () { go(list[(i - 1 + list.length) % list.length]); });
      var next = document.createElement('button');
      next.type = 'button';
      next.textContent = '›';
      next.setAttribute('aria-label', 'Next screen');
      next.style.cssText = btn;
      next.addEventListener('click', function () { go(list[(i + 1) % list.length]); });
      var all = document.createElement('a');
      all.href = '../index.html';
      all.textContent = 'All screens';
      all.style.cssText = btn;
      bar.append(prev, sel, next, all);
      document.body.appendChild(bar);
      document.body.style.paddingBottom = '72px';
    };
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
    document.addEventListener('DOMContentLoaded', addPicker);
  } else {
    mount();
    addPicker();
  }
})();
