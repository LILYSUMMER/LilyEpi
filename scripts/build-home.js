#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'templates/home.html'), 'utf8');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(root, 'content', name), 'utf8'));
}

function keyPaths(value, prefix) {
  if (Array.isArray(value)) {
    if (!value.length || typeof value[0] !== 'object' || value[0] === null) return [prefix + '[]'];
    return keyPaths(value[0], prefix + '[]');
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().flatMap((key) => {
      const next = prefix ? prefix + '.' + key : key;
      const child = keyPaths(value[key], next);
      return child.length ? child : [next];
    });
  }
  return [];
}

function assertSameKeys(a, b) {
  const left = keyPaths(a, '').join('\n');
  const right = keyPaths(b, '').join('\n');
  if (left !== right) {
    const A = new Set(left.split('\n'));
    const B = new Set(right.split('\n'));
    const onlyA = [...A].filter((k) => !B.has(k));
    const onlyB = [...B].filter((k) => !A.has(k));
    throw new Error('content key mismatch\nen only: ' + onlyA.join(', ') + '\nko only: ' + onlyB.join(', '));
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function get(obj, dotted) {
  return dotted.split('.').reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);
}

function media(item, eager, extraClass) {
  if (!item.image) return '';
  const src = item.image.startsWith('/') ? item.image : '/assets/images/' + item.image;
  const file = path.join(root, src.slice(1));
  const fit = item.fit === 'contain' ? ' is-contain' : '';
  const klass = ['frame', item.frame, extraClass, fit].filter(Boolean).join(' ');
  if (!fs.existsSync(file)) {
    return `<div class="${klass} slot"><span>${escapeHtml(item.image)} · ${escapeHtml(item.ratioNote || '')}</span></div>`;
  }
  const loading = eager ? 'eager' : 'lazy';
  const priority = eager ? ' fetchpriority="high"' : '';
  return `<img class="${klass}" src="${escapeHtml(src)}" alt="${escapeHtml(item.alt)}" width="1200" height="900" loading="${loading}"${priority}>`;
}

function prepare(data) {
  const view = { ...data, metaDescriptionJson: JSON.stringify(data.meta.description) };
  view.navHtml = data.nav.map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join('\n');
  view.menuHtml = view.navHtml;
  view.langHtml = data.langs.map((item) => {
    const current = item.current ? ' aria-current="page"' : '';
    return `<a href="${escapeHtml(item.href)}" hreflang="${escapeHtml(item.hreflang)}"${current}>${escapeHtml(item.code)}</a>`;
  }).join('\n<span aria-hidden="true">|</span>\n');
  view.heroMedia = media(data.hero, true, 'hero-img');
  view.painHtml = data.pain.map((item, index) => `
<li class="pain-item">
  <span class="pain-num">${String(index + 1).padStart(2, '0')}</span>
  <div>
    <h3>${escapeHtml(item.title)}</h3>
    <p>${escapeHtml(item.body)}</p>
  </div>
</li>`).join('\n');
  view.workHtml = data.work.map((item) => `
<li class="work-tile">
  <a href="${escapeHtml(item.href)}">
    <div class="work-visual">
      ${item.image ? media(item, false) : `<div class="swatch ${escapeHtml(item.swatch || '')}"></div>`}
    </div>
    <div class="work-meta">
      <span class="work-tag">${escapeHtml(item.tag)}</span>
      <span class="work-title">${escapeHtml(item.title)}</span>
      <span class="work-body">${escapeHtml(item.body)}</span>
    </div>
  </a>
</li>`).join('\n');
  view.firmHtml = data.firm.map((item) => `
<article class="firm-pillar">
  <div class="firm-copy">
    <span class="firm-idx">${escapeHtml(item.idx)}</span>
    <h3>${escapeHtml(item.title)}</h3>
    <p>${escapeHtml(item.body)}</p>
    <p class="firm-from">${escapeHtml(item.from)}</p>
  </div>
  ${media(item, false)}
</article>`).join('\n');
  view.bundlesHtml = data.bundles.map((item) => `
<article class="bundle ${escapeHtml(item.className)}" id="${escapeHtml(item.id)}">
  <div>
    <h3${item.id === 'starter' ? ' id="starter-title"' : ''}>${escapeHtml(item.title)}</h3>
    <ul>${item.includes.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
    <p class="price">${escapeHtml(item.price)}</p>
  </div>
</article>`).join('\n');
  view.proofHtml = data.proof.map((line) => `<li>${escapeHtml(line)}</li>`).join('\n');
  view.processHtml = data.process.map((item, index) => `
<li>
  <span class="num">${String(index + 1).padStart(2, '0')}</span>
  <div>
    <h3>${escapeHtml(item.title)}</h3>
    <p>${escapeHtml(item.body)}</p>
  </div>
</li>`).join('\n');
  return view;
}

function render(tpl, data) {
  return tpl
    .replace(/\{\{\{([\w.]+)\}\}\}/g, (_, key) => {
      const value = get(data, key);
      if (value == null) throw new Error('missing raw ' + key);
      return String(value);
    })
    .replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
      const value = get(data, key);
      if (value == null) throw new Error('missing ' + key);
      return escapeHtml(value);
    });
}

const ALLOWED_DOLLARS = new Set(['4800', '18000', '200', '4,800', '18,000']);

function assertCopy(html, file) {
  const banned = html.match(/유미|yumi|Yuni|윤슬|Yunseul/i);
  if (banned) throw new Error(file + ' contains banned name: ' + banned[0]);
  const dollars = html.match(/\$\s?[\d,]+/g) || [];
  dollars.forEach((token) => {
    const num = token.replace('$', '').trim();
    if (!ALLOWED_DOLLARS.has(num)) throw new Error(file + ' has an unlisted amount: ' + token);
  });
  const tels = html.match(/tel:[^"']+/g) || [];
  if (tels.some((item) => item !== 'tel:+821085133668')) throw new Error(file + ' contains an unexpected tel link');
}

function main() {
  const en = readJson('en.json');
  const ko = readJson('ko.json');
  assertSameKeys(en, ko);
  const pages = [
    ['index.html', en],
    ['ko/index.html', ko]
  ];
  pages.forEach(([file, data]) => {
    const html = render(template, prepare(data));
    if (/\{\{/.test(html)) throw new Error(file + ' still has template markers');
    assertCopy(html, file);
    fs.writeFileSync(path.join(root, file), html);
    console.log('wrote ' + file);
  });
}

main();
