// TUI Shell — interactive terminal REPL for shouli.de.
// Active under .theme-tui on desktop (≥768px).

import { portfolioData } from '../../data.js';

const $ = (id) => document.getElementById(id);
const ROOT = '~/portfolio';
const HIST_KEY = 'tui-history';
const HIST_MAX = 500;

const state = {
  cwd: [],
  input: '',
  history: loadHistory(),
  histIdx: 0,
  ready: false,        // false during boot — input disabled
  modal: null,         // 'vim' | 'matrix' | null
};
state.histIdx = state.history.length;

function isActive() {
  return document.documentElement.classList.contains('theme-tui')
    && window.matchMedia('(min-width: 768px)').matches;
}

function cwdLabel() {
  return state.cwd.length ? `${ROOT}/${state.cwd.join('/')}` : ROOT;
}
function shortCwd() {
  return state.cwd.length ? `~/${state.cwd[state.cwd.length - 1]}` : '~';
}
function projectNames() {
  return Object.keys(portfolioData || {});
}
function dataKey() { return state.cwd.join('/'); }
function entryKind(f) {
  if (f.isMagazine) return 'magazine';
  if (f.isVideo) return 'video';
  return 'image';
}
function currentDirEntries() {
  if (state.cwd.length === 0) {
    return projectNames().map((n) => ({ name: n, kind: 'dir' }));
  }
  const files = portfolioData[dataKey()] || [];
  return files.map((f) => ({
    name: f.name, kind: entryKind(f),
    size: f.size, date: f.date, src: f.src, type: f.type,
    isMagazine: !!f.isMagazine,
  }));
}
function resolveName(input) {
  if (!input) return null;
  const entries = currentDirEntries();
  const lc = input.toLowerCase();
  return entries.find((e) => e.name.toLowerCase() === lc)
    || entries.find((e) => e.name.toLowerCase().startsWith(lc))
    || entries.find((e) => e.name.toLowerCase().includes(lc))
    || null;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ─── History persistence ──────────────────────────────────────────
function loadHistory() {
  try {
    const raw = localStorage.getItem(HIST_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(-HIST_MAX) : [];
  } catch (e) { return []; }
}
function saveHistory() {
  try { localStorage.setItem(HIST_KEY, JSON.stringify(state.history.slice(-HIST_MAX))); }
  catch (e) { /* ignore */ }
}

// ─── URL routing ──────────────────────────────────────────────────
function syncUrl() {
  if (!isActive()) return;
  const params = new URLSearchParams(location.search);
  params.set('theme', 'tui');
  if (state.cwd.length) params.set('cd', state.cwd[0]);
  else params.delete('cd');
  const next = `${location.pathname}?${params.toString()}`;
  if (next !== location.pathname + location.search) {
    history.replaceState(null, '', next);
  }
}
function applyUrlCd() {
  const params = new URLSearchParams(location.search);
  const cd = params.get('cd');
  if (!cd) return;
  const hit = projectNames().find((n) => n.toLowerCase() === cd.toLowerCase())
    || projectNames().find((n) => n.toLowerCase().includes(cd.toLowerCase()));
  if (hit) state.cwd = [hit];
}

// ─── Output ───────────────────────────────────────────────────────
function print(html, cls) {
  const out = $('tui-output');
  if (!out) return;
  const line = document.createElement('div');
  line.className = 'line' + (cls ? ' ' + cls : '');
  line.innerHTML = html;
  out.appendChild(line);
  scrollToBottom();
  return line;
}
function printPlain(text, cls) { print(escapeHtml(text), cls); }
function scrollToBottom() {
  const term = $('tui-terminal');
  if (term) term.scrollTop = term.scrollHeight;
}
function clearOutput() { const o = $('tui-output'); if (o) o.innerHTML = ''; }
function echoCommand(cmd) {
  const promptHtml = `eddie@shouli <span class="accent">${escapeHtml(shortCwd())}</span> $`;
  print(`<span class="prompt-echo">${promptHtml} <span class="cmd">${escapeHtml(cmd)}</span></span>`);
}

// ─── Boot sequence ────────────────────────────────────────────────
const BOOT_LINES = [
  ['Booting <span class="accent">shouli-os</span> v1.0 …', 200],
  ['<span class="ok">[ OK ]</span> <span class="dim">kernel loaded (Linux 6.6.1-shouli)</span>', 180],
  ['<span class="ok">[ OK ]</span> <span class="dim">mounting /portfolio (16 projects)</span>', 220],
  ['<span class="ok">[ OK ]</span> <span class="dim">connecting r2.dev … 142ms</span>', 260],
  ['<span class="ok">[ OK ]</span> <span class="dim">starting jetbrains-mono.service</span>', 140],
  ['<span class="ok">[ OK ]</span> <span class="dim">spawning tui-shell on tty1</span>', 180],
  ['', 100],
];
const MOTD = [
  '<span class="accent">  ┏━┓ ┃ ┃ ┏━┓ ┃ ┃ ┃   ━┳━</span>',
  '<span class="accent">  ┗━┓ ┣━┫ ┃ ┃ ┃ ┃ ┃    ┃ </span>',
  '<span class="accent">  ┗━┛ ╹ ╹ ┗━┛ ┗━┛ ┗━━ ━┻━</span> <span class="dim">.de — eddie\'s portfolio shell</span>',
  '',
  '<span class="dim">Welcome back. Type <span class="accent">help</span> for commands, <span class="accent">ls</span> to look around.</span>',
  '',
];

function boot() {
  let i = 0;
  const next = () => {
    if (i >= BOOT_LINES.length) {
      MOTD.forEach((l) => print(l));
      state.ready = true;
      updatePromptVisible(true);
      return;
    }
    const [html, delay] = BOOT_LINES[i++];
    print(html);
    setTimeout(next, delay);
  };
  updatePromptVisible(false);
  next();
}
function updatePromptVisible(v) {
  const line = $('tui-prompt-line');
  if (line) line.style.visibility = v ? 'visible' : 'hidden';
}

// ─── Commands ─────────────────────────────────────────────────────

const MANPAGES = {
  ls:      'list directory contents',
  ll:      'list with long format: kind, size, date',
  cd:      'change directory: cd <project> | cd .. | cd ~',
  pwd:     'print working directory',
  cat:     'concatenate and print file metadata',
  play:    'open a file in the viewer (alias: open)',
  open:    'open a file or project',
  tree:    'list contents recursively as a tree',
  find:    'find files matching a pattern (find <pattern>)',
  grep:    'search filenames (grep <pattern>)',
  stat:    'display detailed file metadata',
  du:      'disk usage per project',
  df:      'report file system disk space usage',
  uname:   'print system information',
  ps:      'list running modules',
  whoami:  'print effective user',
  date:    'print current date and time',
  echo:    'display a line of text',
  clear:   'clear the terminal screen',
  cls:     'alias for clear',
  history: 'show command history',
  theme:   'switch theme (aero | fiona | material | tui)',
  about:   'about shouli.de',
  contact: 'contact information',
  help:    'list available commands',
  man:     'display the manual for a command',
  sudo:    'execute as superuser (you have no power here)',
  vim:     'the editor of the gods',
  cowsay:  'configurable speaking cow',
  fortune: 'print a random fortune cookie',
  matrix:  'enter the matrix',
  exit:    'leave terminal mode (alias: q, quit)',
};

const COMMANDS = {
  help: cmdHelp, '?': cmdHelp,
  ls: cmdLs, ll: cmdLl, tree: cmdTree, find: cmdFind, grep: cmdGrep,
  pwd: cmdPwd, cd: cmdCd, cat: cmdCat, stat: cmdStat,
  play: cmdPlay, open: cmdOpen,
  clear: clearOutput, cls: clearOutput,
  whoami: () => printPlain('eddie', 'info'),
  date: () => printPlain(new Date().toString(), 'info'),
  echo: (a) => printPlain(a.join(' ')),
  about: cmdAbout, contact: cmdContact,
  theme: cmdTheme, exit: cmdExit, q: cmdExit, quit: cmdExit,
  history: cmdHistory,
  man: cmdMan,
  df: cmdDf, du: cmdDu, uname: cmdUname, ps: cmdPs,
  sudo: cmdSudo, vim: cmdVim, cowsay: cmdCowsay, fortune: cmdFortune, matrix: cmdMatrix,
};

function cmdHelp() {
  print(`<span class="accent">shouli.de</span> <span class="dim">— shell commands</span>`);
  const groups = [
    ['navigation', ['ls', 'll', 'cd', 'pwd', 'tree']],
    ['inspect',    ['cat', 'stat', 'find', 'grep', 'du', 'df']],
    ['actions',    ['play', 'open', 'theme', 'exit']],
    ['system',     ['uname', 'ps', 'whoami', 'date', 'history']],
    ['info',       ['about', 'contact', 'help', 'man']],
    ['fun',        ['sudo', 'vim', 'cowsay', 'fortune', 'matrix']],
  ];
  groups.forEach(([label, cmds]) => {
    const list = cmds.map((c) => `<span class="accent">${c}</span>`).join('  ');
    print(`  <span class="dim">${label.padEnd(10)}</span> ${list}`);
  });
  print(`<span class="dim">tab</span> completes  ·  <span class="dim">↑/↓</span> history  ·  <span class="dim">Ctrl+L</span> clear  ·  <span class="dim">man &lt;cmd&gt;</span> for details`);
}

function cmdLs() {
  const entries = currentDirEntries();
  if (!entries.length) { printPlain('(empty)', 'dim'); return; }
  const cells = entries.map((e) => {
    const suffix = e.kind === 'dir' ? '/' : '';
    return `<span class="${e.kind}">${escapeHtml(e.name)}${suffix}</span>`;
  });
  print(`<div class="grid">${cells.join('')}</div>`);
}
function cmdLl() {
  const entries = currentDirEntries();
  if (!entries.length) { printPlain('(empty)', 'dim'); return; }
  const rows = entries.map((e) => {
    const kind = e.kind === 'dir' ? 'dir  ' : e.kind === 'video' ? 'video' : 'image';
    const size = e.size || (e.kind === 'dir' ? `${(portfolioData[e.name] || []).length} items` : '—');
    const date = e.date || '';
    return `<tr>
      <td class="dim">${kind}</td>
      <td class="dim">${escapeHtml(String(size).padStart(10))}</td>
      <td class="dim">${escapeHtml(date)}</td>
      <td class="name ${e.kind}">${escapeHtml(e.name)}${e.kind === 'dir' ? '/' : ''}</td>
    </tr>`;
  }).join('');
  print(`<table class="ll">${rows}</table>`);
}

function cmdTree() {
  const projects = projectNames();
  print(`<span class="dir">${escapeHtml(ROOT)}/</span>`);
  projects.forEach((p, pi) => {
    const isLastProj = pi === projects.length - 1;
    const branch = isLastProj ? '└─' : '├─';
    print(`${branch} <span class="dir">${escapeHtml(p)}/</span>`);
    const files = (portfolioData[p] || []).slice(0, 6);
    files.forEach((f, fi) => {
      const isLast = fi === files.length - 1;
      const pad = isLastProj ? '   ' : '│  ';
      const sub = isLast ? '└─' : '├─';
      const cls = f.isVideo ? 'video' : 'image';
      print(`${pad}${sub} <span class="${cls}">${escapeHtml(f.name)}</span>`);
    });
    const total = (portfolioData[p] || []).length;
    if (total > files.length) {
      const pad = isLastProj ? '   ' : '│  ';
      print(`${pad}<span class="dim">… ${total - files.length} more</span>`);
    }
  });
}

function cmdFind(args) {
  const pattern = args.join(' ').toLowerCase();
  if (!pattern) { printPlain('find: usage: find <pattern>', 'err'); return; }
  let hits = 0;
  projectNames().forEach((p) => {
    (portfolioData[p] || []).forEach((f) => {
      if (f.name.toLowerCase().includes(pattern) || p.toLowerCase().includes(pattern)) {
        const cls = f.isVideo ? 'video' : 'image';
        print(`<span class="dim">${escapeHtml(ROOT)}/</span><span class="dir">${escapeHtml(p)}/</span><span class="${cls}">${escapeHtml(f.name)}</span>`);
        hits++;
      }
    });
  });
  if (!hits) printPlain('(no matches)', 'dim');
  else printPlain(`${hits} match${hits === 1 ? '' : 'es'}`, 'dim');
}

function cmdGrep(args) {
  const pattern = args.join(' ').toLowerCase();
  if (!pattern) { printPlain('grep: usage: grep <pattern>', 'err'); return; }
  let hits = 0;
  projectNames().forEach((p) => {
    (portfolioData[p] || []).forEach((f) => {
      const hay = `${p} ${f.name} ${f.type || ''} ${f.date || ''}`.toLowerCase();
      const idx = hay.indexOf(pattern);
      if (idx >= 0) {
        const hl = hay.slice(0, idx) + `<span class="accent">${escapeHtml(hay.slice(idx, idx + pattern.length))}</span>` + hay.slice(idx + pattern.length);
        print(`<span class="dim">${escapeHtml(p)}:</span> ${hl}`);
        hits++;
      }
    });
  });
  if (!hits) printPlain('(no matches)', 'dim');
}

function cmdStat(args) {
  const name = args.join(' ').trim();
  if (!name) { printPlain('stat: missing operand', 'err'); return; }
  const e = state.cwd.length ? resolveName(name)
    : projectNames().includes(name) ? { name, kind: 'dir' } : null;
  if (!e) { printPlain(`stat: cannot stat '${name}': no such file or directory`, 'err'); return; }
  print(`  File: <span class="accent">${escapeHtml(e.name)}</span>`);
  print(`  Type: <span class="info">${escapeHtml(e.type || e.kind)}</span>`);
  if (e.size) print(`  Size: <span class="dim">${escapeHtml(e.size)}</span>`);
  if (e.date) print(`Modify: <span class="dim">${escapeHtml(e.date)}</span>`);
  if (e.src)  print(`   Url: <span class="info">${escapeHtml(e.src)}</span>`);
  print(`Access: <span class="ok">readable</span>  Permissions: <span class="dim">-r--r--r--</span>`);
}

function cmdDu() {
  const rows = projectNames().map((p) => {
    const files = portfolioData[p] || [];
    const bytes = files.reduce((sum, f) => sum + parseSize(f.size), 0);
    return [p, bytes, files.length];
  }).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, r) => s + r[1], 0);
  rows.forEach(([name, bytes, count]) => {
    print(`<span class="dim">${humanSize(bytes).padStart(8)}</span>  <span class="dim">${String(count).padStart(3)} files</span>  <span class="dir">${escapeHtml(name)}/</span>`);
  });
  print(`<span class="accent">${humanSize(total).padStart(8)}</span>  <span class="dim">total</span>`);
}

function cmdDf() {
  const totalFiles = projectNames().reduce((s, p) => s + (portfolioData[p] || []).length, 0);
  const totalBytes = projectNames().reduce((s, p) => s + (portfolioData[p] || []).reduce((ss, f) => ss + parseSize(f.size), 0), 0);
  print(`<span class="dim">Filesystem        Size      Used      Avail   Use%   Mounted on</span>`);
  print(`<span class="info">r2.dev</span>           <span class="dim">∞         ${humanSize(totalBytes).padEnd(8)}  ∞         0%</span>   <span class="dir">/portfolio</span>`);
  print(`<span class="info">tmpfs</span>            <span class="dim">∞         0 B       ∞         0%</span>   <span class="dir">/tmp</span>`);
  print(`<span class="dim">${totalFiles} objects across ${projectNames().length} projects</span>`);
}

function cmdUname(args) {
  const flag = args[0] || '';
  if (flag === '-a' || flag === '--all') {
    print(`<span class="info">shouli-os</span> ${location.hostname || 'localhost'} 1.0 #1 SMP <span class="dim">${new Date().toDateString()}</span> webkit-x86_64 <span class="dim">GNU/Browser</span>`);
  } else {
    print(`<span class="info">shouli-os</span>`);
  }
}

function cmdPs() {
  const modules = [
    ['1', 'init', 'app.js'],
    ['2', 'kernel', 'router'],
    ['8', 'shell', 'tui-shell'],
    ['9', 'graphics', 'jetbrains-mono'],
    ['12', 'data', 'portfolio-sync'],
    ['17', 'media', 'video-player'],
    ['23', 'theme', 'm3-shell (idle)'],
    ['24', 'theme', 'aero-shell (idle)'],
    ['25', 'theme', 'ios-shell (idle)'],
    ['26', 'theme', 'android-shell (idle)'],
  ];
  print(`<span class="dim">  PID  GROUP     COMMAND</span>`);
  modules.forEach(([pid, group, cmd]) => {
    print(`<span class="dim">${pid.padStart(5)}  ${group.padEnd(9)}</span> <span class="info">${cmd}</span>`);
  });
}

function cmdHistory() {
  if (!state.history.length) { printPlain('(empty)', 'dim'); return; }
  state.history.slice(-50).forEach((cmd, i) => {
    const num = String(state.history.length - state.history.slice(-50).length + i + 1).padStart(4);
    print(`<span class="dim">${num}</span>  ${escapeHtml(cmd)}`);
  });
}

function cmdMan(args) {
  const cmd = (args[0] || '').toLowerCase();
  if (!cmd) { printPlain('What manual page do you want? For example, try man ls', 'err'); return; }
  const desc = MANPAGES[cmd];
  if (!desc) { printPlain(`No manual entry for ${cmd}`, 'err'); return; }
  print(`<span class="accent">${cmd.toUpperCase()}(1)</span>                       shouli manual                       <span class="accent">${cmd.toUpperCase()}(1)</span>`);
  print('');
  print('<span class="accent">NAME</span>');
  print(`       <span class="info">${escapeHtml(cmd)}</span> — ${escapeHtml(desc)}`);
  print('');
  print('<span class="accent">SYNOPSIS</span>');
  print(`       <span class="info">${escapeHtml(cmd)}</span> <span class="dim">[args…]</span>`);
}

function cmdPwd() { printPlain(cwdLabel(), 'info'); }

function cmdCd(args) {
  const target = args.join(' ').trim();
  if (!target || target === '~') { state.cwd = []; syncUrl(); return; }
  if (target === '..') { state.cwd.pop(); syncUrl(); return; }
  // At root → pick a project. Otherwise → pick a magazine inside the project.
  const entries = currentDirEntries();
  const lc = target.toLowerCase();
  const hit = entries.find((e) => e.name.toLowerCase() === lc)
    || entries.find((e) => e.name.toLowerCase().startsWith(lc))
    || entries.find((e) => e.name.toLowerCase().includes(lc));
  if (!hit) { printPlain(`cd: no such directory: ${target}`, 'err'); return; }
  if (hit.kind !== 'dir' && hit.kind !== 'magazine') {
    printPlain(`cd: not a directory: ${hit.name}`, 'err');
    return;
  }
  // Only allow descending one more level (magazine pages are leaves).
  if (state.cwd.length >= 2) {
    printPlain(`cd: already at deepest level`, 'err');
    return;
  }
  state.cwd.push(hit.name);
  syncUrl();
}

function cmdCat(args) {
  const name = args.join(' ').trim();
  if (!name) { printPlain('cat: missing operand', 'err'); return; }
  if (state.cwd.length === 0) {
    const proj = projectNames().find((n) => n.toLowerCase().includes(name.toLowerCase()));
    if (!proj) { printPlain(`cat: ${name}: no such project`, 'err'); return; }
    const files = portfolioData[proj];
    print(`<span class="accent">${escapeHtml(proj)}</span>`);
    printPlain(`${files.length} file${files.length === 1 ? '' : 's'}`, 'dim');
    const v = files.filter((f) => f.isVideo).length;
    printPlain(`${v} video, ${files.length - v} image`, 'dim');
    return;
  }
  const e = resolveName(name);
  if (!e) { printPlain(`cat: ${name}: no such file`, 'err'); return; }
  print(`<span class="accent">${escapeHtml(e.name)}</span>`);
  printPlain(`type: ${e.type || e.kind}`, 'dim');
  if (e.size) printPlain(`size: ${e.size}`, 'dim');
  if (e.date) printPlain(`date: ${e.date}`, 'dim');
}

// ─── play / open — inline TUI viewer ──────────────────────────────
function cmdOpen(args) { cmdPlay(args); }
function cmdPlay(args) {
  const name = args.join(' ').trim();
  if (!name) { printPlain('play: missing operand', 'err'); return; }
  if (state.cwd.length === 0) {
    const proj = projectNames().find((n) => n.toLowerCase() === name.toLowerCase())
      || projectNames().find((n) => n.toLowerCase().startsWith(name.toLowerCase()))
      || projectNames().find((n) => n.toLowerCase().includes(name.toLowerCase()));
    if (!proj) { printPlain(`play: no such project: ${name}`, 'err'); return; }
    state.cwd = [proj];
    syncUrl();
    printPlain(`entered ${proj}/ — ls to see files`, 'ok');
    return;
  }
  const e = resolveName(name);
  if (!e) { printPlain(`play: ${name}: no such file`, 'err'); return; }
  if (e.kind === 'magazine') { viewMagazine(e); return; }
  if (e.kind === 'image') viewImage(e);
  else if (e.kind === 'video') viewVideo(e);
}

function viewImage(entry) {
  print(`<span class="ok">▶</span> loading <span class="accent">${escapeHtml(entry.name)}</span> …`);
  const wrap = print(`<div class="tui-media"></div>`);
  const div = wrap.querySelector('.tui-media');
  const img = document.createElement('img');
  img.src = entry.src;
  img.alt = entry.name;
  img.className = 'tui-media-img';
  img.onload = () => printPlain(`(${entry.size || ''} · ${entry.date || ''})`, 'dim');
  img.onerror = () => printPlain(`error: failed to load`, 'err');
  div.appendChild(img);
}

function viewVideo(entry) {
  print(`<span class="ok">▶</span> <span class="accent">${escapeHtml(entry.name)}</span>  <span class="dim">${escapeHtml(entry.size || '')}</span>`);
  const bar = print(`<div class="tui-video">
    <video controls preload="metadata" class="tui-media-img"><source src="${escapeHtml(entry.src)}"></video>
    <div class="tui-video-bar"><span class="tui-video-fill"></span></div>
  </div>`);
  const v = bar.querySelector('video');
  const fill = bar.querySelector('.tui-video-fill');
  if (v && fill) {
    v.addEventListener('timeupdate', () => {
      if (!v.duration) return;
      fill.style.width = (v.currentTime / v.duration * 100).toFixed(1) + '%';
    });
  }
}

// ─── Fullscreen magazine reader ───────────────────────────────────
const mag = { pages: [], idx: 0, title: '' };

function viewMagazine(entry) {
  // entry lives at state.cwd[0]; its pages are at portfolioData[state.cwd[0] + '/' + entry.name]
  const key = (state.cwd[0] ? state.cwd[0] + '/' : '') + entry.name;
  const pages = portfolioData[key] || [];
  if (!pages.length) { printPlain(`open: no pages found for ${entry.name}`, 'err'); return; }
  mag.pages = pages;
  mag.idx = 0;
  mag.title = entry.name;
  state.modal = 'magazine';
  updatePromptVisible(false);
  renderMagazine();
}

function renderMagazine() {
  let el = document.querySelector('.tui-modal-mag');
  if (!el) {
    el = document.createElement('div');
    el.className = 'tui-modal-mag';
    el.innerHTML = `
      <div class="tui-mag-header">
        <span class="dim">┌─</span> <span class="accent" id="tui-mag-title"></span> <span class="dim">─┐</span>
        <span class="tui-mag-spacer"></span>
        <span class="dim" id="tui-mag-counter"></span>
        <span class="tui-mag-spacer"></span>
        <span class="dim">[h/l] page</span>
        <span class="tui-mag-spacer"></span>
        <span class="dim">[q] close</span>
      </div>
      <div class="tui-mag-stage">
        <div class="tui-mag-strip">
          <img class="tui-mag-page" data-off="-2" alt="" />
          <img class="tui-mag-page" data-off="-1" alt="" />
          <img class="tui-mag-page" data-off="0"  alt="" />
          <img class="tui-mag-page" data-off="1"  alt="" />
          <img class="tui-mag-page" data-off="2"  alt="" />
        </div>
      </div>
      <div class="tui-mag-footer">
        <div class="tui-mag-progress"><span class="tui-mag-fill"></span></div>
        <span class="dim" id="tui-mag-srcline"></span>
      </div>
    `;
    $('tui-shell').appendChild(el);
  }
  const page = mag.pages[mag.idx];
  el.querySelector('#tui-mag-title').textContent = mag.title;
  el.querySelector('#tui-mag-counter').textContent = `page ${mag.idx + 1} / ${mag.pages.length}`;
  // Render a 5-page strip centered on curr (offsets -2..+2). The stage shows
  // the middle 3 (-1, 0, +1); -2 and +2 are pre-loaded just off-screen so
  // sliding doesn't reveal a blank gap.
  for (const off of [-2, -1, 0, 1, 2]) {
    const i = mag.idx + off;
    const img = el.querySelector(`.tui-mag-page[data-off="${off}"]`);
    if (!img) continue;
    const p = (i >= 0 && i < mag.pages.length) ? mag.pages[i] : null;
    if (p) { img.src = p.src; img.alt = p.name; img.style.visibility = 'visible'; }
    else { img.removeAttribute('src'); img.style.visibility = 'hidden'; }
  }
  el.querySelector('.tui-mag-fill').style.width = ((mag.idx + 1) / mag.pages.length * 100).toFixed(1) + '%';
  el.querySelector('#tui-mag-srcline').textContent = page.name;
}

function closeMagazine() {
  state.modal = null;
  const el = document.querySelector('.tui-modal-mag');
  if (el) el.remove();
  updatePromptVisible(true);
}

let magAnimating = false;
function animatePage(dir, after) {
  if (magAnimating) return;
  const strip = document.querySelector('.tui-mag-strip');
  if (!strip) { after(); return; }
  magAnimating = true;
  // Strip slides by one slot in the direction of travel. The off-screen
  // ±2 images become visible during the slide so there's no blank gap.
  strip.classList.add(dir === 'next' ? 'sliding-next' : 'sliding-prev');
  setTimeout(() => {
    // Disable transition while we swap content + reset transform so the
    // reset doesn't animate backwards.
    strip.style.transition = 'none';
    strip.classList.remove('sliding-next', 'sliding-prev');
    after(); // re-render strip with new idx
    void strip.offsetWidth; // commit no-transition reset
    strip.style.transition = '';
    magAnimating = false;
  }, 220);
}
function magPrev() {
  animatePage('prev', () => {
    mag.idx = (mag.idx - 1 + mag.pages.length) % mag.pages.length;
    renderMagazine();
  });
}
function magNext() {
  animatePage('next', () => {
    mag.idx = (mag.idx + 1) % mag.pages.length;
    renderMagazine();
  });
}
function magFirst() { mag.idx = 0; renderMagazine(); }
function magLast() { mag.idx = mag.pages.length - 1; renderMagazine(); }

function parseSize(s) {
  if (!s) return 0;
  const m = String(s).match(/([\d.]+)\s*(B|KB|MB|GB|TB)?/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = (m[2] || 'B').toUpperCase();
  const mult = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[unit] || 1;
  return n * mult;
}
function humanSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 ** 2) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 ** 3) return (b / 1024 ** 2).toFixed(1) + ' MB';
  return (b / 1024 ** 3).toFixed(2) + ' GB';
}

// ─── About / contact / theme / exit ───────────────────────────────
function cmdAbout() {
  print(`<span class="accent">shouli.de</span> <span class="dim">— eddie\'s portfolio shell</span>`);
  printPlain('A multi-skin portfolio: Aero, Fiona, Material 3, and this TUI.', 'dim');
  printPlain('Try: ls, cd ldn, play, theme fiona, exit', 'dim');
}
function cmdContact() {
  print(`<span class="accent">contact</span>`);
  print(`  <span class="dim">email   </span><span class="info">eddie@shouli.de</span>`);
  print(`  <span class="dim">github  </span><span class="info">github.com/your-handle</span>`);
}
function cmdTheme(args) {
  const name = (args[0] || '').toLowerCase();
  const map = { aero: 'default', default: 'default', fiona: 'pink', pink: 'pink', m3: 'material', material: 'material', tui: 'tui' };
  if (!map[name]) { printPlain('theme: usage: theme <aero|fiona|material|tui>', 'err'); return; }
  printPlain(`switching theme → ${name}`, 'ok');
  setTimeout(() => { if (typeof window.setTheme === 'function') window.setTheme(map[name]); }, 100);
}
function cmdExit() {
  let prev = 'default';
  try { prev = localStorage.getItem('palette-prev') || 'default'; } catch (e) { /* ignore */ }
  printPlain(`bye — back to ${prev}`, 'ok');
  setTimeout(() => { if (typeof window.setTheme === 'function') window.setTheme(prev); }, 250);
}

// ─── Easter eggs ──────────────────────────────────────────────────
function cmdSudo(args) {
  const rest = args.join(' ');
  print(`<span class="err">[sudo] password for eddie:</span> <span class="dim">****</span>`);
  setTimeout(() => printPlain(`Sorry, user eddie is not in the sudoers file. This incident will be reported.`, 'err'), 400);
  if (rest) setTimeout(() => printPlain(`(tried: ${rest})`, 'dim'), 600);
}

function cmdVim(args) {
  state.modal = 'vim';
  updatePromptVisible(false);
  const screen = document.createElement('div');
  screen.className = 'tui-modal-vim';
  const filename = args[0] || '[No Name]';
  const tildes = Array(20).fill('<span class="dim">~</span>').join('\n');
  screen.innerHTML = `
    <div class="tui-vim-body">${tildes}</div>
    <div class="tui-vim-status">
      <span class="info">"${escapeHtml(filename)}"</span> <span class="dim">[New File]</span>
    </div>
    <div class="tui-vim-cmd"><span class="dim">-- press </span><span class="accent">:q</span><span class="dim"> to quit (or just any key after </span><span class="accent">:</span><span class="dim">) --</span></div>
  `;
  $('tui-shell').appendChild(screen);
}
function closeVim() {
  state.modal = null;
  const el = document.querySelector('.tui-modal-vim');
  if (el) el.remove();
  updatePromptVisible(true);
  printPlain('exited vim. ego intact.', 'ok');
}

function cmdCowsay(args) {
  const msg = args.join(' ') || 'moo';
  const bar = '─'.repeat(Math.min(60, msg.length + 2));
  print(`<pre class="tui-pre"> <span class="dim">╭${bar}╮</span>
 <span class="dim">│</span> <span class="accent">${escapeHtml(msg.padEnd(Math.min(60, msg.length)))}</span> <span class="dim">│</span>
 <span class="dim">╰${bar}╯</span>
        <span class="dim">\\</span>   <span class="ok">^__^</span>
         <span class="dim">\\</span>  <span class="ok">(oo)\\_______</span>
            <span class="ok">(__)\\       )\\/\\</span>
                <span class="ok">||----w |</span>
                <span class="ok">||     ||</span></pre>`);
}

const FORTUNES = [
  'You will write the bug that ships to prod tonight.',
  'The compiler is never wrong. The compiler is never wrong. The compiler is —',
  'It is a period of civil war. Rebel coders, striking from a hidden repository …',
  'Speak softly and commit often.',
  'A merge in time saves nine.',
  '`rm -rf /` is not the answer. But it is *an* answer.',
  'You will find the missing semicolon. Just not where you expect.',
  'The bug you are looking for is somewhere else.',
  'Tabs over spaces. Spaces over tabs. Either way, your team will hate you.',
  'In the beginning was the Command Line.',
];
function cmdFortune() {
  const f = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
  printPlain(f, 'info');
}

function cmdMatrix() {
  state.modal = 'matrix';
  updatePromptVisible(false);
  const overlay = document.createElement('div');
  overlay.className = 'tui-modal-matrix';
  overlay.innerHTML = `<div class="tui-matrix-rain"></div>
    <div class="tui-matrix-hint"><span class="accent">[ press any key to exit ]</span></div>`;
  $('tui-shell').appendChild(overlay);
  const rain = overlay.querySelector('.tui-matrix-rain');
  const cols = Math.floor(window.innerWidth / 12);
  const chars = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ01アイウエオカキクケコ'.split('');
  let html = '';
  for (let i = 0; i < cols; i++) {
    const delay = Math.random() * 2;
    const dur = 2 + Math.random() * 3;
    const col = Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join('<br>');
    html += `<div class="tui-matrix-col" style="left:${i * 12}px; animation-delay:${delay}s; animation-duration:${dur}s">${col}</div>`;
  }
  rain.innerHTML = html;
}
function closeMatrix() {
  state.modal = null;
  const el = document.querySelector('.tui-modal-matrix');
  if (el) el.remove();
  updatePromptVisible(true);
}

// ─── REPL ─────────────────────────────────────────────────────────
function execute(raw) {
  const line = raw.trim();
  if (!line) return;
  const [cmd, ...args] = tokenize(line);
  const handler = COMMANDS[cmd.toLowerCase()];
  if (!handler) {
    printPlain(`zsh: command not found: ${cmd}`, 'err');
    printPlain(`(try 'help')`, 'dim');
    return;
  }
  handler(args);
}
function tokenize(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line)) !== null) out.push(m[1] || m[2] || m[3]);
  return out;
}
function updateInputDisplay() {
  const el = $('tui-input-text');
  if (el) el.textContent = state.input;
}
function updatePromptDisplay() {
  const el = $('tui-prompt');
  if (!el) return;
  el.innerHTML = `eddie@shouli <span class="tui-accent">${escapeHtml(shortCwd())}</span> $`;
}
function submit() {
  const cmd = state.input;
  echoCommand(cmd);
  if (cmd.trim()) {
    state.history.push(cmd);
    if (state.history.length > HIST_MAX) state.history.shift();
    saveHistory();
  }
  state.histIdx = state.history.length;
  state.input = '';
  updateInputDisplay();
  execute(cmd);
  updatePromptDisplay();
  scrollToBottom();
}

function tabComplete() {
  const input = state.input;
  const parts = tokenize(input);
  if (!parts.length) return;
  if (parts.length === 1 && !input.endsWith(' ')) {
    const prefix = parts[0].toLowerCase();
    const hits = Object.keys(COMMANDS).filter((c) => c.startsWith(prefix));
    if (hits.length === 1) { state.input = hits[0] + ' '; updateInputDisplay(); }
    else if (hits.length > 1) {
      print(hits.join('  '), 'dim');
      const lcp = longestCommonPrefix(hits);
      if (lcp.length > prefix.length) { state.input = lcp; updateInputDisplay(); }
    }
    return;
  }
  const tail = (parts[parts.length - 1] || '').toLowerCase();
  const candidates = currentDirEntries().map((e) => e.name).filter((n) => n.toLowerCase().startsWith(tail));
  if (!candidates.length) return;
  if (candidates.length === 1) {
    const head = parts.slice(0, -1).join(' ');
    state.input = (head ? head + ' ' : '') + candidates[0];
    updateInputDisplay();
  } else {
    print(candidates.map(escapeHtml).join('  '), 'dim');
    const lcp = longestCommonPrefix(candidates);
    if (lcp.length > tail.length) {
      const head = parts.slice(0, -1).join(' ');
      state.input = (head ? head + ' ' : '') + lcp;
      updateInputDisplay();
    }
  }
}
function longestCommonPrefix(strs) {
  if (!strs.length) return '';
  let p = strs[0];
  for (let i = 1; i < strs.length; i++) {
    while (!strs[i].toLowerCase().startsWith(p.toLowerCase())) {
      p = p.slice(0, -1);
      if (!p) return '';
    }
  }
  return p;
}

function onKey(e) {
  if (!isActive()) return;

  // Modal handlers
  if (state.modal === 'magazine') {
    switch (e.key) {
      case 'l': case 'ArrowRight': case ' ': case 'PageDown': magNext(); break;
      case 'h': case 'ArrowLeft':  case 'PageUp':              magPrev(); break;
      case 'g': case 'Home':                                    magFirst(); break;
      case 'G': case 'End':                                     magLast(); break;
      case 'q': case 'Escape':                                  closeMagazine(); break;
    }
    e.preventDefault();
    return;
  }
  if (state.modal === 'matrix') { closeMatrix(); e.preventDefault(); return; }
  if (state.modal === 'vim') {
    // Any key that looks like :q or just any key gets us out.
    if (e.key === 'Escape' || e.key === 'q' || e.key === 'Q' || e.key === 'Enter' || e.key === ':') {
      closeVim(); e.preventDefault(); return;
    }
    e.preventDefault();
    return;
  }

  if (!state.ready) { e.preventDefault(); return; }
  if (e.metaKey) return;

  if (e.ctrlKey) {
    if (e.key === 'l') { clearOutput(); e.preventDefault(); return; }
    if (e.key === 'c') { echoCommand(state.input); state.input = ''; updateInputDisplay(); e.preventDefault(); return; }
    if (e.key === 'u') { state.input = ''; updateInputDisplay(); e.preventDefault(); return; }
    return;
  }

  switch (e.key) {
    case 'Enter':
      submit(); e.preventDefault(); break;
    case 'Backspace':
      state.input = state.input.slice(0, -1); updateInputDisplay(); e.preventDefault(); break;
    case 'Tab':
      tabComplete(); e.preventDefault(); break;
    case 'ArrowUp':
      if (state.history.length) {
        state.histIdx = Math.max(0, state.histIdx - 1);
        state.input = state.history[state.histIdx] || '';
        updateInputDisplay();
      }
      e.preventDefault(); break;
    case 'ArrowDown':
      if (state.history.length) {
        state.histIdx = Math.min(state.history.length, state.histIdx + 1);
        state.input = state.history[state.histIdx] || '';
        updateInputDisplay();
      }
      e.preventDefault(); break;
    default:
      if (e.key.length === 1) {
        state.input += e.key;
        updateInputDisplay();
        e.preventDefault();
      }
  }
}

function init() {
  if (!$('tui-shell')) return;

  // URL routing — pick up ?cd=…
  applyUrlCd();

  const term = $('tui-terminal');
  if (term) term.addEventListener('click', () => term.focus());

  document.addEventListener('keydown', onKey);

  // Clock
  const clock = $('tui-clock');
  function tick() {
    if (!clock) return;
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  tick(); setInterval(tick, 1000);

  updatePromptDisplay();
  updateInputDisplay();
  syncUrl();
  boot();

  if (isActive() && term) term.focus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
