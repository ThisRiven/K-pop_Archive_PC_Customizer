/* ============================================================
   K-Archive — Single Page App Controller
   ============================================================ */

// ===== CONFIG =====
const PC = [1,5,6,7,9,11,13,15,17,20,22,24,26,28,30,32,34,36,38,40,42,43,45,47,49,51,53,55,57,59,61,63,65,67,69,72,74,77,79,81,83,85,87,89,91,93,95,97,99,101,103,105];
const MOSAIC_PCS = [1,9,17,26,34,42,51,59,67,77,85,93,5,13,22,30,38,47,55,63,72,81,89,97];
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

// ===== AUTH STATE =====
// activeUser is the currently logged-in username (stored in sessionStorage to persist across tab navigation but not between independent sessions)
let activeUser = sessionStorage.getItem('ka_user') || null;

// Per-user storage helpers
function userKey(suffix) { return 'ka_' + activeUser + '_' + suffix; }
function loadUserData(suffix, fallback) {
  if (!activeUser) return fallback;
  try { return JSON.parse(localStorage.getItem(userKey(suffix)) || 'null') || fallback; }
  catch { return fallback; }
}
function saveUserData(suffix, data) {
  if (!activeUser) return;
  localStorage.setItem(userKey(suffix), JSON.stringify(data));
}

// Registered accounts list (object mapping username to password — stored in localStorage)
function getAccounts() {
  try { return JSON.parse(localStorage.getItem('ka_accounts') || '{}'); }
  catch { return {}; }
}
function saveAccounts(accounts) { localStorage.setItem('ka_accounts', JSON.stringify(accounts)); }

// ===== STATE =====
let favs = [];
let uploads = [];
let managing = false;
let favsOnly = false;
let webcamOn = false;
let webcamStream = null;
let lbSrc = '';
let lbKey = '';

// ===== DOM REFS =====
const $ = id => document.getElementById(id);
const gallery = $('gallery');
const layer = $('layer');
const custImg = $('cust-img');
const custVideo = $('cust-video');
const lb = $('lb');
const lbImg = $('lb-img');

// ===== SPARKLES =====
const sparkleBox = $('sparkles');
for (let i = 0; i < 25; i++) {
  const s = document.createElement('div');
  s.className = 'sparkle';
  s.style.left = Math.random() * 100 + '%';
  s.style.animationDuration = (5 + Math.random() * 9) + 's';
  s.style.animationDelay = Math.random() * 12 + 's';
  s.style.width = s.style.height = (1.5 + Math.random() * 2.5) + 'px';
  sparkleBox.appendChild(s);
}

// ===== MOSAIC =====
const mosaic = $('mosaic');
[...MOSAIC_PCS, ...MOSAIC_PCS].forEach(n => {
  const img = document.createElement('img');
  img.src = 'images/Gallery/pc' + n + '.jpg';
  img.alt = '';
  img.loading = 'lazy';
  mosaic.appendChild(img);
});

// ===== AUTH MODAL =====
function switchAuthTab(tab) {
  $('form-login').style.display = tab === 'login' ? 'flex' : 'none';
  $('form-signup').style.display = tab === 'signup' ? 'flex' : 'none';
  $('tab-login').classList.toggle('active', tab === 'login');
  $('tab-signup').classList.toggle('active', tab === 'signup');
  $('login-error').textContent = '';
  $('signup-error').textContent = '';
  // Clear fields
  $('login-user').value = ''; $('login-pass').value = '';
  $('signup-user').value = ''; $('signup-pass').value = '';
  // Focus the relevant input
  setTimeout(() => $(tab === 'login' ? 'login-user' : 'signup-user').focus(), 50);
}

function showAuthModal() {
  const overlay = $('auth-overlay');
  overlay.classList.remove('hidden');
  switchAuthTab('login');
}

function hideAuthModal() {
  $('auth-overlay').classList.add('hidden');
}

// LOGIN
$('login-btn').addEventListener('click', () => {
  const username = $('login-user').value.trim().toLowerCase();
  const password = $('login-pass').value;
  const errEl = $('login-error');
  errEl.textContent = '';

  if (!username || !password) {
    errEl.textContent = 'Please enter both username and password.';
    return;
  }

  const accounts = getAccounts();
  if (!accounts[username]) {
    errEl.textContent = 'Account not found.';
    return;
  }
  if (accounts[username] !== password) {
    errEl.textContent = 'Incorrect password.';
    return;
  }
  loginAs(username);
});

$('login-user').addEventListener('keydown', e => { if (e.key === 'Enter') $('login-pass').focus(); });
$('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') $('login-btn').click(); });

// SIGNUP
$('signup-btn').addEventListener('click', () => {
  const username = $('signup-user').value.trim().toLowerCase();
  const password = $('signup-pass').value;
  const errEl = $('signup-error');
  errEl.textContent = '';

  if (!USERNAME_RE.test(username)) {
    errEl.textContent = 'Username must be 3–30 characters (letters, numbers, underscores).';
    return;
  }
  if (password.length < 4) {
    errEl.textContent = 'Password must be at least 4 characters.';
    return;
  }

  const accounts = getAccounts();
  if (accounts[username]) {
    errEl.textContent = 'That username is taken.';
    return;
  }
  // Register and log in
  accounts[username] = password;
  saveAccounts(accounts);
  loginAs(username);
});

$('signup-user').addEventListener('keydown', e => { if (e.key === 'Enter') $('signup-pass').focus(); });
$('signup-pass').addEventListener('keydown', e => { if (e.key === 'Enter') $('signup-btn').click(); });

function loginAs(username) {
  activeUser = username;
  sessionStorage.setItem('ka_user', username);
  // Load this user's data
  favs = loadUserData('favs', []);
  uploads = loadUserData('uploads', []);
  // Update nav badge
  updateAccountBadge();
  hideAuthModal();
  renderGallery();
}

function updateAccountBadge() {
  if (!activeUser) return;
  $('acct-name').textContent = activeUser;
  $('acct-avatar').textContent = activeUser.charAt(0).toUpperCase();
}

// LOGOUT
$('acct-logout').addEventListener('click', () => {
  if (!confirm('Sign out of "' + activeUser + '"?')) return;
  activeUser = null;
  favs = [];
  uploads = [];
  sessionStorage.removeItem('ka_user');
  managing = false;
  favsOnly = false;
  document.body.classList.remove('managing');
  gallery.innerHTML = '';
  $('counter').textContent = '0 cards';
  showAuthModal();
});

// ===== NAV / ROUTING =====
function go(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const target = $('v-' + view);
  if (target) target.classList.add('active');
  const tab = document.querySelector('[data-view="' + view + '"]');
  if (tab) tab.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // Close mobile menu
  $('nav-tabs').classList.remove('open');
  $('burger').classList.remove('active');
  // Rebuild archive when switching to it
  if (view === 'archive') renderGallery();
}

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => go(tab.dataset.view));
});

$('burger').addEventListener('click', function() {
  this.classList.toggle('active');
  $('nav-tabs').classList.toggle('open');
});

window.addEventListener('scroll', () => {
  $('nav').classList.toggle('scrolled', window.scrollY > 40);
});

// ===== FAVORITES =====
function isFav(key) { return favs.includes(key); }
function toggleFav(key) {
  if (isFav(key)) favs = favs.filter(k => k !== key);
  else favs.push(key);
  saveUserData('favs', favs);
}

// ===== GALLERY RENDER =====
function renderGallery() {
  gallery.innerHTML = '';
  let count = 0;

  // Built-in cards
  PC.forEach(n => {
    const key = 'pc' + n;
    if (favsOnly && !isFav(key)) return;
    count++;
    gallery.appendChild(makeCard('images/Gallery/pc' + n + '.jpg', 'PC ' + n, key, false, null));
  });

  // Uploaded cards (only for logged-in user)
  uploads.forEach((dataUrl, i) => {
    const key = 'up' + i;
    if (favsOnly && !isFav(key)) return;
    count++;
    gallery.appendChild(makeCard(dataUrl, 'Upload ' + (i + 1), key, true, i));
  });

  $('counter').textContent = count + ' card' + (count !== 1 ? 's' : '');
}

function makeCard(src, label, key, isUpload, upIdx) {
  const div = document.createElement('div');
  div.className = 'pc' + (isFav(key) ? ' faved' : '') + (isUpload ? ' uploaded-card' : '');

  // Image
  const img = document.createElement('img');
  img.src = src;
  img.alt = label;
  img.loading = 'lazy';
  div.appendChild(img);

  // Label
  const lbl = document.createElement('span');
  lbl.className = 'pc-label';
  lbl.textContent = label;
  div.appendChild(lbl);

  // Fav button
  const fav = document.createElement('button');
  fav.className = 'pc-fav';
  fav.textContent = isFav(key) ? '♥' : '♡';
  fav.addEventListener('click', e => {
    e.stopPropagation();
    toggleFav(key);
    fav.textContent = isFav(key) ? '♥' : '♡';
    div.classList.toggle('faved', isFav(key));
  });
  div.appendChild(fav);

  // Delete button (only for user's own uploads, hidden behind manage mode)
  if (isUpload) {
    const del = document.createElement('button');
    del.className = 'pc-del uploaded';
    del.textContent = '✕';
    del.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm('Delete "' + label + '"?\n\nThis cannot be undone.')) return;
      uploads.splice(upIdx, 1);
      saveUserData('uploads', uploads);
      renderGallery();
    });
    div.appendChild(del);
  }

  // Click → lightbox
  div.addEventListener('click', () => openLB(src, key));

  return div;
}

// ===== LIGHTBOX =====
function openLB(src, key) {
  lbSrc = src;
  lbKey = key;
  lbImg.src = src;
  updateLBFav();
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLB() {
  lb.classList.remove('open');
  document.body.style.overflow = '';
}

function updateLBFav() {
  const btn = $('lb-fav');
  btn.textContent = isFav(lbKey) ? '♥' : '♡';
  btn.classList.toggle('faved', isFav(lbKey));
}

$('lb-bg').addEventListener('click', closeLB);
$('lb-close').addEventListener('click', closeLB);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLB(); });

$('lb-fav').addEventListener('click', () => {
  toggleFav(lbKey);
  updateLBFav();
  renderGallery();
});

$('lb-cust').addEventListener('click', () => {
  custImg.src = lbSrc;
  closeLB();
  stopWebcam();
  setMode('photo');
  go('customize');
});

// ===== TOOLBAR =====
$('btn-upload').addEventListener('click', function() {
  this.classList.toggle('on');
  $('upzone').classList.toggle('show');
});

$('btn-manage').addEventListener('click', function() {
  managing = !managing;
  this.classList.toggle('on', managing);
  this.textContent = managing ? '✓ Done' : '⚙ Manage';
  document.body.classList.toggle('managing', managing);
});

$('btn-fav').addEventListener('click', function() {
  favsOnly = !favsOnly;
  this.classList.toggle('on', favsOnly);
  this.textContent = favsOnly ? '♥ Show All' : '♡ Favorites';
  renderGallery();
});

// ===== UPLOAD =====
const upzone = $('upzone');
const upfile = $('upfile');

$('upbrowse').addEventListener('click', e => { e.stopPropagation(); upfile.click(); });
upzone.addEventListener('click', () => upfile.click());
upzone.addEventListener('dragover', e => { e.preventDefault(); upzone.classList.add('over'); });
upzone.addEventListener('dragleave', () => upzone.classList.remove('over'));
upzone.addEventListener('drop', e => { e.preventDefault(); upzone.classList.remove('over'); handleFiles(e.dataTransfer.files); });
upfile.addEventListener('change', () => { handleFiles(upfile.files); upfile.value = ''; });

function handleFiles(files) {
  let pending = 0;
  Array.from(files).forEach(f => {
    if (!f.type.startsWith('image/')) return;
    pending++;
    const r = new FileReader();
    r.onload = e => {
      uploads.push(e.target.result);
      pending--;
      if (pending === 0) {
        try { saveUserData('uploads', uploads); }
        catch (err) { alert('Storage full! Try smaller images.'); return; }
        renderGallery();
      }
    };
    r.readAsDataURL(f);
  });
}

// ===== CUSTOMIZER =====
// Border selection
document.querySelectorAll('.border-opt').forEach(img => {
  img.addEventListener('click', () => {
    document.querySelectorAll('.border-opt').forEach(i => i.classList.remove('sel'));
    img.classList.add('sel');
    layer.src = img.src;
    layer.classList.add('on');
  });
});

$('btn-clear').addEventListener('click', () => {
  layer.src = '';
  layer.classList.remove('on');
  document.querySelectorAll('.border-opt').forEach(i => i.classList.remove('sel'));
});

$('btn-print').addEventListener('click', () => window.print());

// Mode toggle
function setMode(mode) {
  const photoBtn = $('mode-photo');
  const camBtn = $('mode-webcam');
  if (mode === 'photo') {
    photoBtn.classList.add('on');
    camBtn.classList.remove('on');
    custImg.style.display = '';
    custVideo.style.display = 'none';
    stopWebcam();
  } else {
    camBtn.classList.add('on');
    photoBtn.classList.remove('on');
    custImg.style.display = 'none';
    custVideo.style.display = '';
    startWebcam();
  }
}

$('mode-photo').addEventListener('click', () => setMode('photo'));
$('mode-webcam').addEventListener('click', () => setMode('webcam'));

function startWebcam() {
  if (webcamOn) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Webcam not supported in this browser.');
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      webcamStream = stream;
      custVideo.srcObject = stream;
      webcamOn = true;
    })
    .catch(err => {
      console.warn('Webcam denied:', err.message);
      alert('Could not access webcam. Please allow camera permissions.');
      setMode('photo');
    });
}

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
  }
  webcamOn = false;
}

// ===== SCROLL REVEAL =====
const obs = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('vis'); });
}, { threshold: 0.1 });
document.querySelectorAll('.feat,.sec-title,.sec-badge').forEach(el => obs.observe(el));

// ===== INIT =====
// Check if user is already logged in (via sessionStorage) or show auth modal
if (activeUser && getAccounts().includes(activeUser)) {
  // Restore session
  favs = loadUserData('favs', []);
  uploads = loadUserData('uploads', []);
  updateAccountBadge();
  renderGallery();
} else {
  // Not logged in — clear stale session and show modal
  sessionStorage.removeItem('ka_user');
  activeUser = null;
  showAuthModal();
}