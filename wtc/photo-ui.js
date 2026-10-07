import {
  PHOTO_DEFAULTS, PHOTO_FIELDS, PHOTO_RATIOS, PHOTO_RESOLUTION_PRESETS,
  normalizePhotoSettings, clampPhotoField, photoFieldToSlider, photoSliderToField,
  setPhotoRatio, setPhotoOrientation, setPhotoResolutionPreset,
} from './photo-settings.js?v=20261006-roofs-7';

// The UI reports intentions; app.js owns camera, rendering and capture lifetime.
export function createPhotoUI(callback = () => {}) {
  const state = normalizePhotoSettings(PHOTO_DEFAULTS);
  const panel = document.querySelector('#photo_ui');
  const enterButton = document.querySelector('#btn_photo_mode');
  const $ = selector => panel.querySelector(selector);
  const $$ = selector => [...panel.querySelectorAll(selector)];
  const removers = [], numeric = new Map();
  let visible = false, disposed = false, capturing = false, tab = 'output';
  let previousFocus = null, layoutFrame = 0;
  const canvas = document.querySelector('#wtc_canvas');
  const guides = document.createElement('div');
  guides.id = 'photo_composition_guides'; guides.hidden = true;
  guides.setAttribute('aria-hidden', 'true');
  for (const axis of ['vertical', 'horizontal']) for (const fraction of [1 / 3, 2 / 3]) {
    const line = document.createElement('span'); line.className = `photo-guide-${axis}`;
    line.style[axis === 'vertical' ? 'left' : 'top'] = `${fraction * 100}%`;
    guides.append(line);
  }
  document.querySelector('#viewport').append(guides);
  function syncGuides() {
    guides.hidden = !visible || !state.compositionGuides || !canvas;
    if (guides.hidden) return;
    const rect = canvas.getBoundingClientRect();
    Object.assign(guides.style, {left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`});
  }
  const emit = (event, key) => { if (!disposed) callback(event, state, key); };
  const listen = (element, event, handler, options) => {
    element.addEventListener(event, handler, options);
    removers.push(() => element.removeEventListener(event, handler, options));
  };
  const pressed = (element, active) => {
    element.classList.toggle('active', active);
    element.setAttribute('aria-pressed', String(active));
  };
  const commitState = (next, notify = false, key) => {
    Object.assign(state, normalizePhotoSettings(next));
    render();
    if (notify) emit('change', key);
    return state;
  };
  const setState = (patch, notify = false) => commitState({...state, ...patch}, notify, Object.keys(patch)[0]);
  function group(parent, label, options, handler, attribute) {
    const wrapper = document.createElement('div');
    wrapper.className = 'control-group';
    const heading = document.createElement('div');
    heading.className = 'control-row';
    const text = document.createElement('span');
    text.className = 'label'; text.textContent = label;
    heading.append(text); wrapper.append(heading);
    const buttons = document.createElement('div');
    buttons.className = 'photo-button-group';
    buttons.setAttribute('role', 'group'); buttons.setAttribute('aria-label', label);
    for (const [value, labelText] of options) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'toggle-btn'; button.textContent = labelText;
      if (attribute) button.dataset[attribute] = value;
      listen(button, 'click', () => { if (!capturing) handler(value); });
      buttons.append(button);
    }
    wrapper.append(buttons); parent.append(wrapper);
    return wrapper;
  }
  function note(parent, text) {
    const p = document.createElement('p'); p.className = 'photo-note'; p.textContent = text; parent.append(p);
  }
  function toggle(parent, key, label) {
    const row = document.createElement('label'); row.className = 'photo-checkbox-row';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.dataset.photoCheck = key;
    const text = document.createElement('span'); text.className = 'label'; text.textContent = label;
    row.append(checkbox, text); parent.append(row);
    listen(checkbox, 'change', () => setState({[key]: checkbox.checked}, true));
  }
  function field(parent, key, label, {slider = true} = {}) {
    const descriptor = PHOTO_FIELDS[key];
    const wrapper = document.createElement('div'); wrapper.className = 'control-group photo-field'; wrapper.dataset.photoField = key;
    const row = document.createElement('div'); row.className = 'control-row';
    const text = document.createElement('label'); text.className = 'label'; text.textContent = label; text.htmlFor = `photo_number_${key}`;
    const value = document.createElement('span'); value.className = 'photo-value';
    const input = document.createElement('input'); input.type = 'number'; input.id = text.htmlFor;
    input.className = 'photo-number'; input.min = descriptor.min; input.max = descriptor.max; input.step = descriptor.step;
    input.setAttribute('aria-label', label); input.inputMode = descriptor.min < 0 ? 'decimal' : 'decimal';
    const unit = document.createElement('span'); unit.className = 'value'; unit.textContent = descriptor.unit ?? '';
    if (key === 'aperture') value.append(unit, input);
    else value.append(input, unit);
    row.append(text, value); wrapper.append(row);
    let range = null, original, skipBlur = false;
    if (slider) {
      range = document.createElement('input'); range.type = 'range'; range.min = 0; range.max = 1; range.step = .0001;
      range.setAttribute('aria-label', `${label} slider`);
      listen(range, 'input', () => setState({[key]: photoSliderToField(key, range.value), ...(key === 'focusDistance' ? {focusInfinity: false} : {})}, true));
      wrapper.append(range);
    }
    const commit = () => {
      if (capturing) return;
      const parsed = input.value.trim() === '' ? original : Number(input.value);
      const value = Number.isFinite(parsed) ? clampPhotoField(key, parsed) : original;
      setState({[key]: value, ...(key === 'focusDistance' ? {focusInfinity: false} : {})}, true);
      input.value = format(key, state[key]);
    };
    listen(input, 'focus', () => { original = state[key]; input.select(); });
    listen(input, 'blur', () => { if (skipBlur) { skipBlur = false; render(); } else commit(); });
    listen(input, 'keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); commit(); skipBlur = true; input.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); skipBlur = true; input.blur(); }
    });
    numeric.set(key, {input, range, wrapper}); parent.append(wrapper);
  }
  function format(key, value) {
    const descriptor = PHOTO_FIELDS[key];
    return descriptor.integer || descriptor.step >= 1 ? String(Math.round(value)) : Number(value).toFixed(1);
  }
  const output = $('#photo_output'), lens = $('#photo_lens'), shift = $('#photo_shift'), color = $('#photo_color'), quality = $('#photo_quality');
  group(output, 'ASPECT RATIO', PHOTO_RATIOS.map(ratio => [ratio, ratio]), value => commitState(setPhotoRatio(state, value), true, 'ratio'), 'photoRatio');
  group(output, 'LONG EDGE', PHOTO_RESOLUTION_PRESETS.map((edge, i) => [edge, `${[2, 4, 8][i]}K`]), value => commitState(setPhotoResolutionPreset(state, Number(value)), true, 'resolutionPreset'), 'photoResolution');
  group(output, 'ORIENTATION', [['landscape', 'LANDSCAPE'], ['portrait', 'PORTRAIT']], value => commitState(setPhotoOrientation(state, value), true, 'orientation'), 'photoOrientation');
  const dimensions = document.createElement('div'); dimensions.className = 'photo-dimensions'; output.append(dimensions);
  field(dimensions, 'width', 'WIDTH', {slider: false}); field(dimensions, 'height', 'HEIGHT', {slider: false});
  note(output, 'Custom dimensions: 64–8192 px per side. 2K / 4K / 8K long edge: 2560 / 3840 / 7680 px.');
  group(lens, 'LENS', [['mm', 'mm'], ['dfov', 'DFOV']], value => setState({lensMode: value}, true), 'photoLens');
  field(lens, 'focalLength', 'FOCAL LENGTH'); field(lens, 'dfov', 'DIAGONAL FOV');
  toggle(lens, 'dof', 'DEPTH OF FIELD');
  field(lens, 'aperture', 'APERTURE');
  group(lens, 'FOCUS MODE', [['auto', 'AUTO'], ['point', 'POINT'], ['manual', 'MANUAL']], value => setState({focusMode: value}, true), 'photoFocusMode');
  field(lens, 'focusDistance', 'FOCUS DISTANCE');
  toggle(lens, 'focusInfinity', '∞ INFINITY');
  note(lens, 'AUTO follows the center as you compose. POINT lets you click surfaces repeatedly and keeps the selected target. MANUAL holds the distance you set.');
  toggle(shift, 'shiftEnabled', 'ENABLE LENS SHIFT');
  toggle(shift, 'compositionGuides', '3 × 3 COMPOSITION GUIDES');
  field(shift, 'shiftX', 'HORIZONTAL SHIFT'); field(shift, 'shiftY', 'VERTICAL SHIFT');
  field(shift, 'pitch', 'PITCH'); field(shift, 'yaw', 'YAW'); field(shift, 'roll', 'ROLL');
  group(shift, 'ALIGN CAMERA', [['level', 'LEVEL'], ['north', 'NORTH']], value => emit(value));
  note(shift, 'Shift reframes the image without tilting the camera. LEVEL sets pitch and roll to zero. NORTH faces true north.');
  toggle(color, 'autoWhiteBalance', 'AUTO WHITE BALANCE');
  field(color, 'temperature', 'TEMPERATURE'); field(color, 'tint', 'TINT'); field(color, 'contrast', 'CONTRAST'); field(color, 'saturation', 'SATURATION'); field(color, 'grain', 'GRAIN');
  note(color, 'Automatic white balance estimates the current frame. Turn it off to restore your manual temperature and tint.');
  note(color, 'Color effects apply only in photo mode. Exposure and scene lighting follow Graphics Settings.');
  field(quality, 'bounces', 'REFLECTION BOUNCES'); field(quality, 'shadowSamples', 'SHADOW SAMPLES'); field(quality, 'samples', 'ACCUMULATION SAMPLES');
  group(quality, 'SAMPLES', [32, 64, 128, 512, 1024].map(value => [value, String(value)]), value => setState({samples: Number(value)}, true), 'photoSamples');
  note(quality, 'These quality settings apply to the final photo. Preview uses the real-time graphics quality and render scale.');

  function render() {
    syncGuides();
    for (const [key, {input, range, wrapper}] of numeric) {
      // Keep a numeric draft intact while the camera sends live angle updates.
      if (document.activeElement !== input) input.value = format(key, state[key]);
      if (range) range.value = photoFieldToSlider(key, state[key]);
      wrapper.hidden = key === 'focalLength' ? state.lensMode !== 'mm' : key === 'dfov' ? state.lensMode !== 'dfov' : false;
      const unavailable = capturing || (key === 'aperture' && !state.dof) || (key === 'focusDistance' && state.focusMode !== 'manual') || (['temperature', 'tint'].includes(key) && state.autoWhiteBalance) || (['shiftX', 'shiftY'].includes(key) && !state.shiftEnabled);
      input.disabled = unavailable; if (range) range.disabled = unavailable;
    }
    $$('[data-photo-check]').forEach(input => {
      const manualInfinity = input.dataset.photoCheck === 'focusInfinity';
      input.checked = state[input.dataset.photoCheck];
      input.disabled = capturing || (manualInfinity && state.focusMode !== 'manual');
      if (manualInfinity) input.closest('label').hidden = state.focusMode !== 'manual';
    });
    $$('[data-photo-ratio]').forEach(button => pressed(button, button.dataset.photoRatio === state.ratio));
    $$('[data-photo-resolution]').forEach(button => pressed(button, Number(button.dataset.photoResolution) === state.resolutionPreset));
    $$('[data-photo-orientation]').forEach(button => pressed(button, button.dataset.photoOrientation === state.orientation));
    $$('[data-photo-lens]').forEach(button => pressed(button, button.dataset.photoLens === state.lensMode));
    $$('[data-photo-samples]').forEach(button => pressed(button, Number(button.dataset.photoSamples) === state.samples));
    $$('[data-photo-focus-mode]').forEach(button => pressed(button, button.dataset.photoFocusMode === state.focusMode));
    $$('.photo-button-group button').forEach(button => { button.disabled = capturing; });
    $('#photo_output_res').textContent = `${state.width} × ${state.height}`;
    $('#btn_photo_capture').disabled = capturing;
    $('#btn_photo_capture').textContent = capturing ? 'CAPTURING…' : 'TAKE PHOTO';
    $('#btn_photo_cancel').hidden = !capturing;
    pressed(enterButton, visible);
    syncGuides();
  }
  function selectTab(next) {
    tab = next;
    $$('[data-photo-tab]').forEach(button => {
      const selected = button.dataset.photoTab === next;
      button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    $$('.photo-tab-panel').forEach(section => { section.hidden = section.id !== `photo_${next}`; });
    $('#photo_body').scrollTop = 0;
  }
  $$('[data-photo-tab]').forEach(button => {
    listen(button, 'click', () => selectTab(button.dataset.photoTab));
    listen(button, 'keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const tabs = $$('[data-photo-tab]'), index = tabs.findIndex(item => item.dataset.photoTab === tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectTab(tabs[next].dataset.photoTab); tabs[next].focus();
    });
  });
  const oldPanels = [...document.querySelectorAll('#ui, #building_ui')];
  function layout() {
    if (!visible || disposed) return;
    syncGuides();
    const height = window.visualViewport?.height || window.innerHeight;
    // Both existing menus stay visible, with their own scroll area above photo.
    for (const old of oldPanels) {
      const scale = old.classList.contains('collapsed') ? 1 : old.getBoundingClientRect().width / old.offsetWidth || 1;
      const maximum = `${Math.max(80, height * .43 / scale)}px`;
      if (old.style.maxHeight !== maximum) old.style.maxHeight = maximum;
    }
    const buildingBottom = document.querySelector('#building_ui').getBoundingClientRect().bottom;
    const bottom = Number.parseFloat(getComputedStyle(panel).bottom) || 10;
    const maximum = `${Math.max(130, height - buildingBottom - bottom - 14)}px`;
    if (panel.style.maxHeight !== maximum) panel.style.maxHeight = maximum;
  }
  function requestLayout() {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => { layoutFrame = 0; layout(); });
  }
  function open(initial = {}) {
    if (disposed || visible) return;
    previousFocus = document.activeElement;
    setState(initial); visible = true; panel.hidden = false;
    document.body.classList.add('photo-active'); render(); layout();
    emit('enter'); $('#btn_photo_close').focus();
  }
  function close() {
    if (!visible || disposed) return;
    if (capturing) emit('cancel');
    visible = false; panel.hidden = true; document.body.classList.remove('photo-active');
    oldPanels.forEach(old => { old.style.maxHeight = ''; });
    render(); emit('exit'); (previousFocus?.isConnected ? previousFocus : enterButton)?.focus();
  }
  function stats({width, height} = {}) {
    if (Number.isFinite(width) && Number.isFinite(height)) $('#photo_preview_res').textContent = `${width} × ${height}`;
  }
  function status(message = '') { $('#photo_status').textContent = message; }
  function progress({active = false, completed = 0, total = state.samples, message} = {}) {
    capturing = active; $('#photo_progress_row').hidden = !active;
    $('#photo_progress').max = Math.max(1, total); $('#photo_progress').value = Math.min(total, completed);
    $('#photo_progress_text').textContent = `${Math.round(completed)} / ${total}`;
    if (message !== undefined) status(message);
    render(); requestLayout();
  }
  listen(enterButton, 'click', () => visible ? close() : open());
  listen($('#btn_photo_close'), 'click', close);
  listen($('#btn_photo_capture'), 'click', () => { if (!capturing) emit('capture'); });
  listen($('#btn_photo_cancel'), 'click', () => emit('cancel'));
  listen(panel, 'keydown', event => {
    // Keyboard camera controls must never see typing or range/checkbox keys.
    if (event.target.matches('input, textarea, select')) event.stopPropagation();
  });
  listen(window, 'resize', requestLayout);
  if (window.visualViewport) listen(window.visualViewport, 'resize', requestLayout);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(requestLayout) : null;
  oldPanels.forEach(old => observer?.observe(old));
  if (canvas) observer?.observe(canvas);
  const mutations = typeof MutationObserver === 'function' ? new MutationObserver(requestLayout) : null;
  oldPanels.forEach(old => mutations?.observe(old, {attributes: true, attributeFilter: ['class', 'style']}));
  if (canvas) mutations?.observe(canvas, {attributes: true, attributeFilter: ['style', 'width', 'height']});
  render();
  return {state, open, close, setState, stats, progress, status, get visible() {return visible;},
    dispose() { close(); disposed = true; guides.remove(); removers.forEach(remove => remove()); observer?.disconnect(); mutations?.disconnect(); if (layoutFrame) cancelAnimationFrame(layoutFrame); },
  };
}
