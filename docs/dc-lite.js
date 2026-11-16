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

  function focusKey(el) {
    if (!el || !el.id) return null;
    return { id: el.id, start: el.selectionStart, end: el.selectionEnd };
  }

  function mount() {
    var host = document.querySelector('x-dc');
    var scriptEl = document.querySelector('script[data-dc-script]');
    if (!host || !scriptEl) return;
    var helmet = host.querySelector('helmet');
    if (helmet) {
      Array.prototype.slice.call(helmet.childNodes).forEach(function (n) {
        if (n.nodeType === 1) document.head.appendChild(n);
      });
      helmet.remove();
    }
    var tpl = document.createElement('template');
    tpl.innerHTML = host.innerHTML;
    var props = {};
    try {
      var decl = JSON.parse(scriptEl.getAttribute('data-props') || '{}');
      Object.keys(decl).forEach(function (k) {
        if (k.charAt(0) !== '$' && decl[k] && 'default' in decl[k]) props[k] = decl[k]['default'];
      });
    } catch (e) {}
    var Component = new Function('DCLogic', scriptEl.textContent + '\n;return Component;')(DCLogic);
    var comp = new Component(props);
    comp.props = props;
    var root = document.createElement('div');
    root.className = 'dc-root';
    host.parentNode.insertBefore(root, host);
    host.remove();
    comp.__render = function () {
      var keep = focusKey(document.activeElement);
      var frag = document.createDocumentFragment();
      kids(tpl, [comp.renderVals ? comp.renderVals() : {}], frag);
      root.replaceChildren(frag);
      if (keep) {
        var back = document.getElementById(keep.id);
        if (back) {
          back.focus();
          try { back.setSelectionRange(keep.start, keep.end); } catch (e) {}
        }
      }
    };
    comp.__render();
    if (comp.componentDidMount) comp.componentDidMount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
