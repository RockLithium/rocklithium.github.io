export const DEFAULTS = {
  preset: 'low',
  bounces: 1,
  shadowSamples: 0,
  scaleIdx: 1,
  minutes: 900,
  playing: false,
  daySeconds: 180,
  exposure: 1,
  fog: true,
  cloud: true,
  hdr: false,
  force16_9: false,
  layers: 4095,
  towers: 63,
  cutMode: 0,
  cutHeight: 220,
  cutSide: 0,
  floor: 0,
  view: 'overview',
  infoOpen: false,
};

export const SCALE_LEVELS = Object.freeze([0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 3, 4]);
export const FIXED_RESOLUTIONS = Object.freeze([
  [640, 360], [854, 480], [1280, 720], [1920, 1080], [2560, 1440],
  [3840, 2160], [5120, 2880], [7680, 4320], [8192, 4608],
]);
export const LAYER_BUTTONS = Object.freeze([
  ['FACADE', 1], ['STEEL', 2], ['CORE', 4], ['FLOORS', 8],
  ['TRUSSES', 16], ['ROOF', 64], ['STAIRS', 256], ['ELEVATORS', 512],
  ['LIGHTS', 1024], ['INTERIOR', 2048], ['BASEMENT', 32], ['SITE', 128],
].map(([label, bit]) => Object.freeze({ label, bit })));

export function toggleMask(mask, bit) {
  return (Number(mask) | 0) ^ (Number(bit) | 0);
}

export const DEFAULT_DFOV = 84.1;
export function getVerticalFov(diagonalFov, aspect) {
  return 2 * Math.atan(Math.tan(diagonalFov * Math.PI / 360) / Math.hypot(1, aspect)) * 180 / Math.PI;
}
export function getDiagonalFov(verticalFov, aspect) {
  const vertical = Number(verticalFov), ratio = Number(aspect);
  if (!Number.isFinite(vertical) || vertical <= 0 || vertical >= 180 || !Number.isFinite(ratio) || ratio <= 0) return NaN;
  return 2 * Math.atan(Math.tan(vertical * Math.PI / 360) * Math.hypot(1, ratio)) * 180 / Math.PI;
}

// Match raytracing's mobile desktop-viewport correction without changing 1x.
export function effectivePixelRatio({cssWidth,cssHeight,devicePixelRatio=1,screenWidth=cssWidth,screenHeight=cssHeight}) {
  const screenMinimum=Math.min(Number(screenWidth)||cssWidth,Number(screenHeight)||cssHeight);
  const viewportMinimum=Math.min(cssWidth,cssHeight);
  const zoomRatio=screenMinimum>0?Math.max(1,viewportMinimum/screenMinimum):1;
  return Math.max(.1,Number(devicePixelRatio)||1)/zoomRatio;
}
export function getRenderDimensions({ cssWidth, cssHeight, devicePixelRatio = 1, screenWidth=cssWidth,screenHeight=cssHeight,scaleIdx = 4, force16_9 = false, maxSize = 8192 }) {
  const index = Math.max(0, Math.min(SCALE_LEVELS.length - 1, Math.round(Number(scaleIdx) || 0)));
  const scale = SCALE_LEVELS[index];
  const dpr=effectivePixelRatio({cssWidth,cssHeight,devicePixelRatio,screenWidth,screenHeight});
  const [requestedWidth, requestedHeight] = force16_9
    ? FIXED_RESOLUTIONS[index]
    : [Number(cssWidth) * dpr * scale,Number(cssHeight) * dpr * scale];
  const limit = Math.max(16, Math.floor(Number(maxSize) || 8192));
  const requestedW = Math.max(16, Math.floor(requestedWidth));
  const requestedH = Math.max(16, Math.floor(requestedHeight));
  const factor = Math.min(1, limit / requestedW, limit / requestedH);
  return {
    requestedWidth: requestedW,
    requestedHeight: requestedH,
    width: Math.max(16, Math.floor(requestedW * factor)),
    height: Math.max(16, Math.floor(requestedH * factor)),
    scale,
    capped: factor < 1,
  };
}
export const QUALITY_PRESETS = Object.freeze({
  low: { bounces: 1, shadowSamples: 0, scaleIdx: 1 },
  mid: { bounces: 2, shadowSamples: 0, scaleIdx: 2 },
  high: { bounces: 4, shadowSamples: 1, scaleIdx: 3 },
  ultra: { bounces: 6, shadowSamples: 2, scaleIdx: 4 },
  extreme: { bounces: 8, shadowSamples: 4, scaleIdx: 5 },
});

const clampMinutes = (value) => Math.max(0, Math.min(1439, Math.floor(Number(value) || 0)));
const formatTime = (minutes) => {
  const value = clampMinutes(minutes);
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};
const parseTime = (value) => {
  const [hours = 0, minutes = 0] = String(value || '0:0').split(':').map(Number);
  return clampMinutes(hours * 60 + minutes);
};

export function createUI(onChange = () => {}) {
  const state = { ...DEFAULTS };
  const removers = [];
  let disposed = false;
  let previousFocus = null;
  let noticeTimer = null;
  let scaleLabelKey = null;
  let scaleLabel = null;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const listen = (element, type, handler, options) => {
    if (!element) return;
    element.addEventListener(type, handler, options);
    removers.push(() => element.removeEventListener(type, handler, options));
  };
  const emit = (key) => {
    if (!disposed && typeof onChange === 'function') onChange(state, key);
  };
  const setState = (patch, notify = true) => {
    if (disposed || !patch || typeof patch !== 'object') return state;
    const keys = Object.keys(patch);
    Object.assign(state, patch);
    render();
    if (notify) keys.forEach(emit);
    return state;
  };

  function render() {
    const setRange = (id, value, force = false) => { const input = $(id); if (input && (force || document.activeElement !== input)) input.value = String(value); };
    const setText = (id, value) => { const element = $(id); if (element) element.textContent = String(value); };
    const setPressed = (element, pressed) => {
      element.classList.toggle('active', Boolean(pressed));
      element.setAttribute('aria-pressed', String(Boolean(pressed)));
    };

    $$('[data-preset]').forEach((button) => setPressed(button, button.dataset.preset === state.preset));
    setRange('#in_bounces', state.bounces);
    setText('#val_bounces', state.bounces);
    setRange('#in_shadow', state.shadowSamples);
    setText('#val_shadow', state.shadowSamples);
    setRange('#in_scale', state.scaleIdx);
    const nextScaleLabelKey = `${Boolean(state.force16_9)}:${state.scaleIdx}`;
    if (nextScaleLabelKey !== scaleLabelKey) { scaleLabelKey = nextScaleLabelKey; scaleLabel = null; }
    setText('#val_scale', scaleLabel ?? `${SCALE_LEVELS[state.scaleIdx] ?? SCALE_LEVELS[4]}x`);
    const exposureInput = $('#in_exposure');
    if (exposureInput && document.activeElement !== exposureInput) exposureInput.value = String(state.exposure);
    setText('#val_exposure', Number(state.exposure).toFixed(2));
    const timeInput = $('#in_time');
    if (timeInput && document.activeElement !== timeInput) timeInput.value = formatTime(state.minutes);
    setRange('#in_time_slider', clampMinutes(state.minutes), Boolean(state.playing));
    setText('#val_time', formatTime(state.minutes));
    setPressed($('#btn_play'), state.playing);
    setText('#btn_play', state.playing ? 'PAUSE' : 'PLAY');
    setRange('#in_day_seconds', state.daySeconds);
    setText('#val_day_seconds', `${state.daySeconds} s`);

    $$('[data-toggle]').forEach((button) => setPressed(button, state[button.dataset.toggle]));
    $$('[data-towers]').forEach((button) => setPressed(button, (Number(button.dataset.towers) & Number(state.towers)) !== 0));
    $$('[data-layer]').forEach((button) => setPressed(button, (Number(state.layers) & Number(button.dataset.layer)) !== 0));
    $$('[data-cut]').forEach((button) => setPressed(button, Number(button.dataset.cut) === Number(state.cutMode)));
    const horizontalCut = Number(state.cutMode) === 1;
    const cutSideGroup = $('#cut_side_controls');
    cutSideGroup?.setAttribute('aria-label', horizontalCut ? 'Horizontal cut: keep bottom or top' : 'Vertical cut: keep north or south');
    $$('[data-cut-side]').forEach((button) => {
      const side = Number(button.dataset.cutSide);
      const sideName = horizontalCut ? (side === 0 ? 'BOTTOM' : 'TOP') : (side === 0 ? 'NORTH' : 'SOUTH');
      button.textContent = sideName;
      button.setAttribute('aria-label', `Keep ${sideName.toLowerCase()}`);
      setPressed(button, side === Number(state.cutSide));
    });
    setRange('#in_cut_height', state.cutHeight);
    setText('#val_cut_height', state.cutHeight);
    setRange('#in_floor', state.floor);
    setText('#val_floor', Number(state.floor) === 0 ? 'ALL' : state.floor);
    $$('[data-view]').forEach((button) => setPressed(button, button.dataset.view === state.view));

    const sources = $('#sources_panel');
    sources?.classList.toggle('open', Boolean(state.infoOpen));
    sources?.setAttribute('aria-hidden', String(!state.infoOpen));
    const fullscreen = Boolean(document.fullscreenElement);
    setPressed($('#btn_full'), fullscreen);
  }

  function range(id, key, parse = Number, extraPatch = null) {
    listen($(id), 'input', (event) => {
      const value = parse(event.currentTarget.value);
      setState({ [key]: value, ...(extraPatch ? extraPatch(value) : {}) });
    });
  }

  range('#in_bounces', 'bounces', (value) => Math.round(Number(value)), () => ({ preset: 'custom' }));
  range('#in_shadow', 'shadowSamples', (value) => Math.max(0, Math.min(8, Math.round(Number(value)))), () => ({ preset: 'custom' }));
  range('#in_scale', 'scaleIdx', (value) => Math.max(0, Math.min(8, Math.round(Number(value)))), () => ({ preset: 'custom' }));
  range('#in_exposure', 'exposure');
  range('#in_day_seconds', 'daySeconds', (value) => Math.round(Number(value)));
  range('#in_cut_height', 'cutHeight', (value) => Math.round(Number(value)));
  range('#in_floor', 'floor', (value) => Math.max(0, Math.min(110, Math.round(Number(value)))));

  listen($('#in_time'), 'input', (event) => {
    setState({ minutes: parseTime(event.currentTarget.value), playing: false });
  });
  listen($('#in_time_slider'), 'input', (event) => {
    setState({ minutes: clampMinutes(event.currentTarget.value), playing: false });
  });
  listen($('#btn_play'), 'click', () => setState({ playing: !state.playing }));
  $$('[data-preset]').forEach((button) => {
    listen(button, 'click', () => {
      const preset = button.dataset.preset;
      setState({ preset, ...QUALITY_PRESETS[preset] });
    });
  });
  $$('[data-toggle]').forEach((button) => {
    listen(button, 'click', () => {
      const key = button.dataset.toggle;
      setState({ [key]: !state[key] });
    });
  });
  $$('[data-towers]').forEach((button) => listen(button, 'click', () => {
    setState({ towers: toggleMask(state.towers, Number(button.dataset.towers)) });
  }));
  $$('[data-layer]').forEach((button) => {
    listen(button, 'click', () => {
      const bit = Number(button.dataset.layer);
      setState({ layers: Number(state.layers) ^ bit });
    });
  });
  $$('[data-cut]').forEach((button) => listen(button, 'click', () => setState({ cutMode: Number(button.dataset.cut) })));
  $$('[data-cut-side]').forEach((button) => listen(button, 'click', () => setState({ cutSide: Number(button.dataset.cutSide) })));
  $$('[data-view]').forEach((button) => listen(button, 'click', () => setState({ view: button.dataset.view })));

  const uiPanel = $('#ui');
  const buildPanel = $('#building_ui');
  const collapse = (panel, button, scaleOrigin) => {
    const collapsed = !panel.classList.contains('collapsed');
    panel.classList.toggle('collapsed', collapsed);
    button.textContent = collapsed ? '+' : '–';
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', ` ${collapsed ? 'Expand' : 'Collapse'} ${panel === uiPanel ? 'graphics settings' : 'building controls'}`.trim());
    if (collapsed) panel.style.transform = 'scale(1)';
    else panel.style.transform = window.innerWidth < 500 ? 'scale(0.65)' : 'scale(1)';
  };
  listen($('#btn_min'), 'click', (event) => collapse(uiPanel, event.currentTarget, '0 0'));
  listen($('#btn_build_min'), 'click', (event) => collapse(buildPanel, event.currentTarget, '100% 0'));

  const toggleSources = (open) => {
    previousFocus = document.activeElement;
    setState({ infoOpen: open });
    if (open) $('#sources_card')?.focus();
    else if (previousFocus?.focus) previousFocus.focus();
  };
  listen($('#btn_sources'), 'click', () => toggleSources(!state.infoOpen));
  listen($('#btn_sources_close'), 'click', () => toggleSources(false));
  listen($('#sources_panel'), 'click', (event) => {
    if (event.target === event.currentTarget) toggleSources(false);
  });
  listen(document, 'keydown', (event) => {
    if (event.key === 'Escape' && state.infoOpen) toggleSources(false);
  });

  listen($('#btn_full'), 'click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (error) {
      status(error?.message || 'Fullscreen is not available in this browser.', true);
    }
  });
  listen(document, 'fullscreenchange', render);
  listen($('#btn_reset_view'), 'click', () => {
    setState({ view: 'overview' });
    emit('resetView');
  });
  listen($('#btn_screenshot'), 'click', () => emit('screenshot'));
  listen($('#loading_retry'), 'click', () => window.location.reload());

  function stats(values = {}) {
    const { fps, width, height, dfov } = values || {};
    if (width !== undefined && height !== undefined) {
      $('#res_text').textContent = width && height ? `${Math.round(width)}×${Math.round(height)}` : '-';
    }
    if (values.scaleLabel !== undefined) {
      scaleLabel = String(values.scaleLabel);
      $('#val_scale').textContent = scaleLabel;
    }
    const warning = $('#limit_warning');
    if (warning && values.warning !== undefined) {
      warning.textContent = String(values.warning);
      warning.style.display = values.warning ? 'block' : 'none';
    }
    if (fps !== undefined) {
      $('#fps').textContent = Number.isFinite(Number(fps)) ? Number(fps).toFixed(1) : '0';
    }
    if (dfov !== undefined && Number.isFinite(Number(dfov))) {
      const fovText = $('#fov_text');
      const label = fovText?.parentElement?.firstChild;
      if (label?.nodeType === 3) label.textContent = 'DFOV: ';
      if (fovText) fovText.textContent = `${Number(dfov).toFixed(1)}°`;
    }
  }

  function selection(info) {
    const box = $('#selection_info');
    const title = $('#selection_title');
    const rows = $('#selection_rows');
    rows.replaceChildren();
    if (info === undefined || info === null || info === false) {
      box.classList.remove('open');
      return;
    }
    let entries;
    if (typeof info === 'object') {
      title.textContent = String(info.title ?? info.name ?? info.label ?? 'Selection');
      entries = Object.entries(info).filter(([key]) => !['title', 'name', 'label'].includes(key));
    } else {
      title.textContent = 'Selection';
      entries = [['Details', info]];
    }
    for (const [key, value] of entries) {
      const row = document.createElement('tr');
      const label = document.createElement('td');
      const data = document.createElement('td');
      label.textContent = String(key).replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
      if (value && typeof value === 'object') {
        try { data.textContent = JSON.stringify(value); } catch { data.textContent = String(value); }
      } else data.textContent = value === undefined || value === null ? '' : String(value);
      row.append(label, data);
      rows.append(row);
    }
    box.classList.add('open');
  }

  function status(text, error = false) {
    const loading = $('#loading');
    const message = String(text ?? '');
    const ready = /^(ready|loaded|complete|completed)\b/i.test(message.trim());
    if (!error && ready) {
      loading.hidden = true;
      loading.classList.remove('error');
      return;
    }
    if (!error && loading.hidden) {
      if (message) notice(message);
      return;
    }
    $('#loading_status').textContent = message;
    loading.classList.toggle('error', Boolean(error));
    loading.hidden = !error && !message;
  }

  function notice(text, duration = 3000) {
    const message = String(text ?? '');
    if (!message) return;
    const element = $('#status_notice');
    $('#status_notice_text').textContent = message;
    element.classList.add('show');
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      element.classList.remove('show');
      noticeTimer = null;
    }, Math.max(500, Number(duration) || 3000));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (noticeTimer) clearTimeout(noticeTimer);
    removers.splice(0).forEach((remove) => remove());
  }

  render();
  return { state, setState, stats, selection, status, notice, dispose };
}

export default createUI;
