/**
 * Radio Manantial 105.3 FM - Reproductor Oficial
 * Sonando para ti desde Los Mochis, Sinaloa, México
 */

// --- CONFIGURACIÓN PRINCIPAL ---
const CONFIG = {
  stationName: 'Radio Manantial',
  stationDial: '105.3 FM',
  location: 'Los Mochis, Sinaloa, México',
  streamUrl: 'https://manant-megacaster.radioca.st/stream',
  statsUrl: 'https://manant-megacaster.radioca.st/stats?sid=1&json=1',
  pollIntervalMs: 5000,
  defaultCover: '/assets/logo.png',
  whatsappNumber: '526682288161'
};

// --- ESTADO DE LA APLICACIÓN ---
const state = {
  isPlaying: false,
  isLoading: false,
  isMuted: false,
  volume: 0.9,
  currentSong: '',
  currentArtist: '',
  currentCover: CONFIG.defaultCover,
  listeners: 0,
  history: [],
  sleepTimer: {
    totalSeconds: 0,
    remainingSeconds: 0,
    intervalId: null
  },
  audioCtx: null,
  analyser: null,
  audioSourceNode: null,
  visualizerAnimId: null
};

// --- ELEMENTOS DEL DOM ---
const audio = document.getElementById('radio-audio');
const btnPlayPause = document.getElementById('btn-play-pause');
const iconPlay = document.getElementById('icon-play');
const iconStop = document.getElementById('icon-stop');
const bufferingSpinner = document.getElementById('buffering-spinner');
const streamStatusText = document.getElementById('stream-status-text');

const songTitleEl = document.getElementById('song-title');
const songArtistEl = document.getElementById('song-artist');
const albumArtEl = document.getElementById('album-art');
const listenersCountText = document.getElementById('listeners-count-text');
const streamQualityText = document.getElementById('stream-quality-text');

const volumeSlider = document.getElementById('volume-slider');
const btnVolumeToggle = document.getElementById('btn-volume-toggle');
const iconVolHigh = document.getElementById('icon-vol-high');
const iconVolMute = document.getElementById('icon-vol-mute');

const btnOpenTimer = document.getElementById('btn-open-timer');
const modalTimer = document.getElementById('modal-timer');
const btnCloseTimerModal = document.getElementById('btn-close-timer-modal');
const timerBadge = document.getElementById('timer-active-badge');
const chipTimerCountdown = document.getElementById('chip-timer-countdown');
const timerRemainingText = document.getElementById('timer-remaining-text');
const btnCancelTimer = document.getElementById('btn-cancel-timer');

const btnShare = document.getElementById('btn-share');
const btnQuickPrayer = document.getElementById('btn-quick-prayer');
const modalPrayer = document.getElementById('modal-prayer');
const btnClosePrayerModal = document.getElementById('btn-close-prayer-modal');
const btnSendPrayerWhatsApp = document.getElementById('btn-send-prayer-whatsapp');
const prayerNameInput = document.getElementById('prayer-name');
const prayerTextInput = document.getElementById('prayer-text');

const canvas = document.getElementById('visualizer-canvas');
const canvasCtx = canvas.getContext('2d');
const statusTimeEl = document.getElementById('status-time');
const metaPingStatusEl = document.getElementById('meta-ping-status');

// Navigation
const navButtons = document.querySelectorAll('.nav-item');
const tabViews = document.querySelectorAll('.tab-view');
const historyList = document.getElementById('history-list');

// Simulator switches
const btnDevicePhone = document.getElementById('btn-device-phone');
const btnDeviceFull = document.getElementById('btn-device-full');
const localIpDisplay = document.getElementById('local-ip-display');

// ==========================================================================
// 1. CONTROL DE AUDIO
// ==========================================================================

function initAudio() {
  audio.volume = state.volume;

  audio.addEventListener('waiting', () => {
    state.isLoading = true;
    updatePlayerUI();
  });

  audio.addEventListener('playing', () => {
    state.isLoading = false;
    state.isPlaying = true;
    document.getElementById('artwork-card').parentElement.parentElement.classList.add('playing');
    updatePlayerUI();
    setupWebAudio();
  });

  audio.addEventListener('pause', () => {
    state.isPlaying = false;
    state.isLoading = false;
    document.getElementById('artwork-card').parentElement.parentElement.classList.remove('playing');
    updatePlayerUI();
  });

  audio.addEventListener('error', (e) => {
    console.warn('Audio stream error, reconectando...', e);
    state.isLoading = false;
    state.isPlaying = false;
    streamStatusText.textContent = 'RECONECTANDO';
    updatePlayerUI();
    setTimeout(() => {
      if (state.isPlaying) togglePlay();
    }, 3000);
  });
}

function togglePlay() {
  if (state.isPlaying) {
    audio.pause();
    audio.src = ''; // Libera el stream para ahorrar datos y batería
    state.isPlaying = false;
    state.isLoading = false;
    updatePlayerUI();
  } else {
    state.isLoading = true;
    updatePlayerUI();
    // Añadimos timestamp para evitar caché de audio congelado
    const streamUrlWithCacheBust = `${CONFIG.streamUrl}?nocache=${Date.now()}`;
    audio.src = streamUrlWithCacheBust;
    audio.load();
    audio.play().catch(err => {
      console.error('Error al reproducir stream:', err);
      state.isLoading = false;
      state.isPlaying = false;
      updatePlayerUI();
    });
  }
}

function updatePlayerUI() {
  if (state.isLoading) {
    bufferingSpinner.classList.remove('hidden');
    iconPlay.classList.add('hidden');
    iconStop.classList.add('hidden');
    streamStatusText.textContent = 'CONECTANDO...';
  } else if (state.isPlaying) {
    bufferingSpinner.classList.add('hidden');
    iconPlay.classList.add('hidden');
    iconStop.classList.remove('hidden');
    streamStatusText.textContent = 'EN VIVO';
  } else {
    bufferingSpinner.classList.add('hidden');
    iconPlay.classList.remove('hidden');
    iconStop.classList.add('hidden');
    streamStatusText.textContent = 'DETENIDO';
  }
}

// ==========================================================================
// 2. VOLUMEN
// ==========================================================================

function setVolume(val) {
  state.volume = Math.max(0, Math.min(1, val));
  audio.volume = state.isMuted ? 0 : state.volume;
  volumeSlider.value = state.volume;

  if (state.volume === 0 || state.isMuted) {
    iconVolHigh.classList.add('hidden');
    iconVolMute.classList.remove('hidden');
  } else {
    iconVolHigh.classList.remove('hidden');
    iconVolMute.classList.add('hidden');
  }
}

volumeSlider.addEventListener('input', (e) => {
  state.isMuted = false;
  setVolume(parseFloat(e.target.value));
});

btnVolumeToggle.addEventListener('click', () => {
  state.isMuted = !state.isMuted;
  setVolume(state.volume);
});

// ==========================================================================
// 3. ECUALIZADOR VISUAL (WEB AUDIO API + ANIMACIÓN)
// ==========================================================================

function setupWebAudio() {
  try {
    if (!state.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        state.audioCtx = new AudioCtx();
        state.analyser = state.audioCtx.createAnalyser();
        state.analyser.fftSize = 64;
        state.analyser.smoothingTimeConstant = 0.8;

        // Conectar MediaElement al Analyser (con fallback si CORS bloquea)
        try {
          state.audioSourceNode = state.audioCtx.createMediaElementSource(audio);
          state.audioSourceNode.connect(state.analyser);
          state.analyser.connect(state.audioCtx.destination);
        } catch (e) {
          console.log('Usando visualizador de frecuencias armónicas dinámicas');
        }
      }
    }

    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }

    if (!state.visualizerAnimId) {
      renderVisualizer();
    }
  } catch (err) {
    console.log('AudioContext init notice:', err);
  }
}

let animPhase = 0;
function renderVisualizer() {
  state.visualizerAnimId = requestAnimationFrame(renderVisualizer);

  const width = canvas.width;
  const height = canvas.height;
  canvasCtx.clearRect(0, 0, width, height);

  const numBars = 32;
  const barWidth = Math.floor(width / numBars) - 2;

  let freqData = new Uint8Array(numBars);

  if (state.isPlaying && state.analyser && state.audioSourceNode) {
    try {
      const buffer = new Uint8Array(state.analyser.frequencyBinCount);
      state.analyser.getByteFrequencyData(buffer);
      for (let i = 0; i < numBars; i++) {
        freqData[i] = buffer[i % buffer.length];
      }
    } catch {
      freqData = null;
    }
  }

  // Si no hay datos directos de FFT o está en pausa, generamos ondas suaves
  animPhase += 0.08;
  for (let i = 0; i < numBars; i++) {
    let barHeight = 4;

    if (state.isPlaying) {
      if (freqData && freqData[i] > 10) {
        barHeight = Math.max(4, (freqData[i] / 255) * height * 0.9);
      } else {
        // Simulación armónica en vivo con ritmo orgánico
        const wave1 = Math.sin(animPhase + i * 0.35);
        const wave2 = Math.cos(animPhase * 0.8 + i * 0.2);
        const waveFactor = (wave1 + wave2 + 2) / 4;
        barHeight = Math.max(6, waveFactor * (height - 8));
      }
    } else {
      barHeight = 4;
    }

    const x = i * (barWidth + 2);
    const y = height - barHeight;

    // Gradiente Cyan Radio Manantial
    const gradient = canvasCtx.createLinearGradient(0, y, 0, height);
    gradient.addColorStop(0, '#04adf6');
    gradient.addColorStop(0.5, '#0084c7');
    gradient.addColorStop(1, 'rgba(4, 173, 246, 0.2)');

    canvasCtx.fillStyle = gradient;
    canvasCtx.beginPath();
    canvasCtx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
    canvasCtx.fill();
  }
}

// ==========================================================================
// 4. METADATOS EN VIVO & BÚSQUEDA DE CARÁTULA ITUNES
// ==========================================================================

async function fetchMetadata() {
  try {
    const res = await fetch(CONFIG.statsUrl);
    if (!res.ok) throw new Error('Status no disponible');
    const data = await res.json();

    if (metaPingStatusEl) {
      metaPingStatusEl.textContent = 'En línea (OK)';
      metaPingStatusEl.className = 'status-online';
    }

    if (data.currentlisteners !== undefined) {
      state.listeners = data.currentlisteners;
      listenersCountText.textContent = `${state.listeners} oyentes en línea`;
    }

    if (data.bitrate) {
      streamQualityText.textContent = `HD ${data.bitrate} kbps • Estéreo`;
    }

    const rawTitle = (data.songtitle || '').trim();
    if (rawTitle && rawTitle !== state.currentSong) {
      handleSongChange(rawTitle);
    }
  } catch (err) {
    if (metaPingStatusEl) {
      metaPingStatusEl.textContent = 'Reintentando...';
      metaPingStatusEl.className = 'color-highlight';
    }
  }
}

async function handleSongChange(rawTitle) {
  state.currentSong = rawTitle;

  // Analizar formato común: "Artista - Canción"
  let artist = 'Radio Manantial 105.3 FM';
  let title = rawTitle;

  if (rawTitle.includes(' - ')) {
    const parts = rawTitle.split(' - ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  }

  state.currentArtist = artist;

  songTitleEl.textContent = title;
  songArtistEl.textContent = artist;

  // Actualizar historial local
  addToHistory({ title, artist, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });

  // Buscar portada de la alabanza
  await fetchAlbumArt(artist, title);

  // Actualizar controles de pantalla de bloqueo y barra de notificación (MediaSession)
  updateMediaSession(title, artist, state.currentCover);
}

async function fetchAlbumArt(artist, title) {
  // Ignorar búsquedas si es el nombre de la radio
  const cleanQuery = `${artist} ${title}`.replace(/Radio Manantial|105\.3|FM/gi, '').trim();

  if (!cleanQuery) {
    setCover(CONFIG.defaultCover);
    return;
  }

  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&media=music&entity=song&limit=1`;
    const res = await fetch(itunesUrl);
    const data = await res.json();

    if (data.results && data.results.length > 0 && data.results[0].artworkUrl100) {
      const highResArt = data.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
      setCover(highResArt);
      return;
    }
  } catch (e) {
    console.log('Cover lookup fallback to default');
  }

  setCover(CONFIG.defaultCover);
}

function setCover(url) {
  state.currentCover = url;
  albumArtEl.src = url;

  // Actualizar fondo sutil de brillo con el color de la portada
  const glow = document.getElementById('artwork-glow');
  if (glow) {
    glow.style.background = url !== CONFIG.defaultCover
      ? `radial-gradient(circle, rgba(4, 173, 246, 0.5) 0%, transparent 70%)`
      : `radial-gradient(circle, var(--color-primary-glow) 0%, transparent 70%)`;
  }
}

function addToHistory(item) {
  // Evitar duplicados seguidos
  if (state.history.length > 0 && state.history[0].title === item.title) return;

  state.history.unshift(item);
  if (state.history.length > 25) state.history.pop();

  renderHistory();
}

function renderHistory() {
  if (state.history.length === 0) return;

  historyList.innerHTML = state.history.map(item => `
    <div class="history-item">
      <img src="${state.currentCover || CONFIG.defaultCover}" class="history-thumb" alt="Cover" onerror="this.src='${CONFIG.defaultCover}'" />
      <div class="history-meta">
        <div class="history-song">${escapeHtml(item.title)}</div>
        <div class="history-artist">${escapeHtml(item.artist)}</div>
      </div>
      <div class="history-time">${item.time}</div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ==========================================================================
// 5. MEDIASESSION API (NOTIFICACIONES Y PANTALLA DE BLOQUEO ANDROID)
// ==========================================================================

function updateMediaSession(title, artist, artwork) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || 'Radio Manantial 105.3 FM',
      artist: artist || 'Los Mochis, Sinaloa',
      album: 'Transmisión en Vivo',
      artwork: [
        { src: artwork || CONFIG.defaultCover, sizes: '512x512', type: 'image/png' }
      ]
    });

    navigator.mediaSession.setActionHandler('play', () => togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => togglePlay());
    navigator.mediaSession.setActionHandler('stop', () => togglePlay());
  }
}

// ==========================================================================
// 6. TEMPORIZADOR DE APAGADO (SLEEP TIMER)
// ==========================================================================

function setSleepTimer(minutes) {
  clearInterval(state.sleepTimer.intervalId);

  if (minutes <= 0) {
    state.sleepTimer.totalSeconds = 0;
    state.sleepTimer.remainingSeconds = 0;
    timerBadge.classList.remove('active');
    chipTimerCountdown.classList.add('hidden');
    closeModal(modalTimer);
    return;
  }

  state.sleepTimer.totalSeconds = minutes * 60;
  state.sleepTimer.remainingSeconds = minutes * 60;

  timerBadge.classList.add('active');
  chipTimerCountdown.classList.remove('hidden');
  updateTimerDisplay();

  state.sleepTimer.intervalId = setInterval(() => {
    state.sleepTimer.remainingSeconds--;

    if (state.sleepTimer.remainingSeconds <= 0) {
      clearInterval(state.sleepTimer.intervalId);
      // Apagado suave
      fadeOutAndStop();
      setSleepTimer(0);
    } else {
      updateTimerDisplay();
    }
  }, 1000);

  closeModal(modalTimer);
}

function updateTimerDisplay() {
  const m = Math.floor(state.sleepTimer.remainingSeconds / 60);
  const s = state.sleepTimer.remainingSeconds % 60;
  timerRemainingText.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fadeOutAndStop() {
  let vol = audio.volume;
  const fadeInterval = setInterval(() => {
    vol -= 0.05;
    if (vol <= 0) {
      clearInterval(fadeInterval);
      audio.volume = state.volume;
      if (state.isPlaying) togglePlay();
    } else {
      audio.volume = vol;
    }
  }, 150);
}

// ==========================================================================
// 7. MODALES Y ACCIONES RÁPIDAS
// ==========================================================================

function openModal(el) {
  el.classList.remove('hidden');
}

function closeModal(el) {
  el.classList.add('hidden');
}

btnOpenTimer.addEventListener('click', () => openModal(modalTimer));
btnCloseTimerModal.addEventListener('click', () => closeModal(modalTimer));
modalTimer.addEventListener('click', (e) => {
  if (e.target === modalTimer) closeModal(modalTimer);
});

btnCancelTimer.addEventListener('click', () => setSleepTimer(0));

document.querySelectorAll('.timer-opt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mins = parseInt(btn.dataset.minutes, 10);
    setSleepTimer(mins);
  });
});

// Petición / Saludo Modal
btnQuickPrayer.addEventListener('click', () => openModal(modalPrayer));
btnClosePrayerModal.addEventListener('click', () => closeModal(modalPrayer));
modalPrayer.addEventListener('click', (e) => {
  if (e.target === modalPrayer) closeModal(modalPrayer);
});

btnSendPrayerWhatsApp.addEventListener('click', () => {
  const name = prayerNameInput.value.trim() || 'Un oyente';
  const text = prayerTextInput.value.trim() || 'Quiero mandar un saludo a la radio y pedir una alabanza.';
  const message = `Hola Radio Manantial 105.3 FM, soy *${name}*:\n\n${text}\n\n(Enviado desde la App Móvil)`;
  const url = `https://api.whatsapp.com/send?phone=${CONFIG.whatsappNumber}&text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
  closeModal(modalPrayer);
  prayerTextInput.value = '';
});

// Compartir
btnShare.addEventListener('click', async () => {
  const shareData = {
    title: 'Radio Manantial 105.3 FM',
    text: `¡Escucha Radio Manantial 105.3 FM en vivo! Sonando para ti desde Los Mochis, Sinaloa. Alabanzas y palabra de fe.`,
    url: window.location.href
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (e) {
      // Ignorar si el usuario canceló
    }
  } else {
    navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
    alert('¡Enlace de la radio copiado al portapapeles!');
  }
});

// ==========================================================================
// 8. NAVEGACIÓN POR PESTAÑAS (TABS)
// ==========================================================================

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;

    navButtons.forEach(b => b.classList.remove('active'));
    tabViews.forEach(v => v.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById(targetId).classList.add('active');
  });
});

// ==========================================================================
// 9. RELOJ DEL SISTEMA & SIMULADOR
// ==========================================================================

function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  if (statusTimeEl) statusTimeEl.textContent = `${hours}:${minutes}`;
}
setInterval(updateClock, 1000);
updateClock();

// Controles del simulador en Desktop
btnDevicePhone?.addEventListener('click', () => {
  document.body.classList.remove('fullscreen-mode');
  btnDevicePhone.classList.add('active');
  btnDeviceFull.classList.remove('active');
});

btnDeviceFull?.addEventListener('click', () => {
  document.body.classList.add('fullscreen-mode');
  btnDeviceFull.classList.add('active');
  btnDevicePhone.classList.remove('active');
});

// Actualizar URL local en la caja de información
if (localIpDisplay) {
  localIpDisplay.textContent = window.location.href;
}

// Botón de Play Principal
btnPlayPause.addEventListener('click', togglePlay);

// ==========================================================================
// 10. INICIALIZACIÓN
// ==========================================================================

initAudio();
fetchMetadata();
setInterval(fetchMetadata, CONFIG.pollIntervalMs);

// Service Worker (para soporte de App / PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Bloqueo estricto de rebote y arrastre vertical en la pantalla del reproductor
document.addEventListener('touchmove', (e) => {
  const activeTab = document.querySelector('.tab-view.active');
  const isTimerOpen = !modalTimer.classList.contains('hidden');
  const isPrayerOpen = !modalPrayer.classList.contains('hidden');

  if (!activeTab || activeTab.id === 'view-player' || isTimerOpen || isPrayerOpen) {
    if (!e.target.closest('.volume-slider') && !e.target.closest('textarea') && !e.target.closest('input')) {
      e.preventDefault();
    }
  }
}, { passive: false });

