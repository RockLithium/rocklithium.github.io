import {effectivePixelRatio, SCALE_LEVELS, DEFAULT_DFOV} from './ui.js?v=20261006-roofs-7';

export const PHOTO_RATIOS = Object.freeze(['21:9', '16:9', '3:2', '4:3', '5:4', '1:1']);
export const PHOTO_RESOLUTION_PRESETS = Object.freeze([2560, 3840, 7680]);
export const PHOTO_SENSOR_DIAGONAL = Math.hypot(36, 24);
export const PHOTO_DEFAULTS = Object.freeze({
  ratio: '16:9', orientation: 'landscape', resolutionPreset: 3840,
  width: 3840, height: 2160, samples: 64, bounces: 1, shadowSamples: 0,
  lensMode: 'mm', focalLength: PHOTO_SENSOR_DIAGONAL / (2 * Math.tan(DEFAULT_DFOV * Math.PI / 360)),
  dfov: DEFAULT_DFOV,
  compositionGuides: true, shiftEnabled: false, shiftX: 0, shiftY: 0, pitch: 0, yaw: 0, roll: 0,
  dof: false, aperture: 8, focusMode: 'auto', focusDistance: 60, focusInfinity: false,
  autoWhiteBalance: false, temperature: 6500, tint: 0, contrast: 100, saturation: 100, grain: 0,
});

const field = (min, max, step, extra = {}) => Object.freeze({min, max, step, ...extra});
// Values are physical units, even when a slider uses logarithmic positioning.
export const PHOTO_FIELDS = Object.freeze({
  width: field(64, 8192, 1, {integer: true, unit: 'px'}),
  height: field(64, 8192, 1, {integer: true, unit: 'px'}),
  samples: field(1, 1024, 1, {integer: true}),
  bounces: field(1, 12, 1, {integer: true}),
  shadowSamples: field(0, 8, 1, {integer: true}),
  focalLength: field(10, 400, .1, {logarithmic: true, unit: 'mm'}),
  dfov: field(2 * Math.atan(PHOTO_SENSOR_DIAGONAL / 800) * 180 / Math.PI,
    2 * Math.atan(PHOTO_SENSOR_DIAGONAL / 20) * 180 / Math.PI, .1, {unit: '°'}),
  shiftX: field(-12, 12, .1, {unit: 'mm'}),
  shiftY: field(-12, 12, .1, {unit: 'mm'}),
  pitch: field(-89.9, 89.9, .1, {unit: '°'}),
  yaw: field(0, 360, .1, {unit: '°'}),
  roll: field(-180, 180, .1, {unit: '°'}),
  aperture: field(1.4, 22, .1, {logarithmic: true, unit: 'f/'}),
  focusDistance: field(.3, 5000, .1, {logarithmic: true, unit: 'm'}),
  temperature: field(2000, 12000, 1, {integer: true, unit: 'K'}),
  tint: field(-100, 100, 1),
  contrast: field(0, 200, 1),
  saturation: field(0, 200, 1),
  grain: field(0, 100, 1),
});

export function clampPhotoField(name, value) {
  const descriptor = PHOTO_FIELDS[name];
  if (!descriptor) throw new RangeError(`Unknown photo field: ${name}`);
  let number = Number(value);
  if (Number.isNaN(number)) number = PHOTO_DEFAULTS[name];
  number = Math.max(descriptor.min, Math.min(descriptor.max, number));
  return descriptor.integer ? Math.round(number) : number;
}

export function photoFieldToSlider(name, value) {
  const descriptor = PHOTO_FIELDS[name];
  if (!descriptor) throw new RangeError(`Unknown photo field: ${name}`);
  const clamped = clampPhotoField(name, value);
  return descriptor.logarithmic
    ? Math.log(clamped / descriptor.min) / Math.log(descriptor.max / descriptor.min)
    : (clamped - descriptor.min) / (descriptor.max - descriptor.min);
}

export function photoSliderToField(name, position) {
  const descriptor = PHOTO_FIELDS[name];
  if (!descriptor) throw new RangeError(`Unknown photo field: ${name}`);
  const unit = Math.max(0, Math.min(1, Number(position) || 0));
  return clampPhotoField(name, descriptor.logarithmic
    ? descriptor.min * (descriptor.max / descriptor.min) ** unit
    : descriptor.min + (descriptor.max - descriptor.min) * unit);
}

export function photoAspect(ratio = PHOTO_DEFAULTS.ratio, orientation = 'landscape') {
  const validRatio = PHOTO_RATIOS.includes(ratio) ? ratio : PHOTO_DEFAULTS.ratio;
  const [wide, high] = validRatio.split(':').map(Number);
  return orientation === 'portrait' ? high / wide : wide / high;
}

export function photoPresetDimensions(longEdge, ratio = '16:9', orientation = 'landscape') {
  const edge = clampPhotoField('width', longEdge);
  const aspect = photoAspect(ratio, orientation);
  return aspect >= 1
    ? {width: edge, height: clampPhotoField('height', edge / aspect)}
    : {width: clampPhotoField('width', edge * aspect), height: edge};
}

// Button selection is derived from the entered pixels, including exact rounded
// preset dimensions, so manually entering a preset activates its button again.
export function getPhotoResolutionSelection(width, height) {
  const w = clampPhotoField('width', width), h = clampPhotoField('height', height);
  const orientation = w >= h ? 'landscape' : 'portrait';
  const edge = Math.max(w, h);
  const ratio = PHOTO_RATIOS.find(candidate => {
    const dims = photoPresetDimensions(edge, candidate, orientation);
    return dims.width === w && dims.height === h;
  }) ?? null;
  const resolutionPreset = ratio && PHOTO_RESOLUTION_PRESETS.includes(edge) ? edge : null;
  return {ratio, orientation, resolutionPreset};
}

export function normalizeFocusMode(value) {
  return value === 'point' || value === 'manual' ? value : 'auto';
}

export function normalizePhotoSettings(settings = {}) {
  const result = {...PHOTO_DEFAULTS, ...settings};
  for (const name of Object.keys(PHOTO_FIELDS)) result[name] = clampPhotoField(name, result[name]);
  result.compositionGuides = Boolean(result.compositionGuides);
  result.dof = Boolean(result.dof);
  result.autoWhiteBalance = Boolean(result.autoWhiteBalance);
  result.focusMode = normalizeFocusMode(result.focusMode);
  result.shiftEnabled = Boolean(result.shiftEnabled);
  result.lensMode = result.lensMode === 'dfov' ? 'dfov' : 'mm';
  if (result.lensMode === 'dfov') result.focalLength = diagonalFovToFocalLength(result.dfov);
  else result.dfov = focalLengthToDiagonalFov(result.focalLength);
  result.focusInfinity = Boolean(result.focusInfinity || Number(settings.focusDistance) === Infinity);
  // A custom ratio remains a real output aspect; ratio only records button state.
  Object.assign(result, getPhotoResolutionSelection(result.width, result.height));
  if (result.width === result.height && settings.orientation === 'portrait') result.orientation = 'portrait';
  return result;
}

export function focalLengthToDiagonalFov(focalLength) {
  return 2 * Math.atan(PHOTO_SENSOR_DIAGONAL / (2 * clampPhotoField('focalLength', focalLength))) * 180 / Math.PI;
}

export function diagonalFovToFocalLength(dfov) {
  return clampPhotoField('focalLength', PHOTO_SENSOR_DIAGONAL / (2 * Math.tan(clampPhotoField('dfov', dfov) * Math.PI / 360)));
}

export function setPhotoFocalLength(settings, focalLength) {
  return normalizePhotoSettings({...settings, focalLength, lensMode: 'mm'});
}

export function setPhotoDiagonalFov(settings, dfov) {
  return normalizePhotoSettings({...settings, dfov, lensMode: 'dfov'});
}

export function setPhotoResolution(settings, width, height) {
  return normalizePhotoSettings({...settings, width, height});
}

export function setPhotoRatio(settings, ratio) {
  const current = normalizePhotoSettings(settings);
  const selected = PHOTO_RATIOS.includes(ratio) ? ratio : PHOTO_DEFAULTS.ratio;
  return normalizePhotoSettings({...current, ...photoPresetDimensions(Math.max(current.width, current.height), selected, current.orientation)});
}

export function setPhotoOrientation(settings, orientation) {
  const current = normalizePhotoSettings(settings);
  const selected = orientation === 'portrait' ? 'portrait' : 'landscape';
  if (selected === current.orientation) return current;
  return normalizePhotoSettings({...current, width: current.height, height: current.width, orientation: selected});
}

export function setPhotoResolutionPreset(settings, longEdge) {
  const current = normalizePhotoSettings(settings);
  const edge = PHOTO_RESOLUTION_PRESETS.includes(Number(longEdge)) ? Number(longEdge) : PHOTO_DEFAULTS.resolutionPreset;
  const aspect = current.width / current.height;
  const dims = aspect >= 1 ? {width: edge, height: edge / aspect} : {width: edge * aspect, height: edge};
  return normalizePhotoSettings({...current, ...dims});
}

// Preview size depends on CSS viewport, aspect, DPR correction and render scale.
// Neither photo output preset nor ordinary FORCE 16:9 resolution enters here.
export function getPreviewDimensions({cssWidth, cssHeight, devicePixelRatio = 1, screenWidth = cssWidth,
  screenHeight = cssHeight, scaleIdx = 4, aspect = 16 / 9, maxSize = 8192}) {
  const viewportWidth = Math.max(1, Number(cssWidth) || 1), viewportHeight = Math.max(1, Number(cssHeight) || 1);
  const ratio = Number.isFinite(Number(aspect)) && Number(aspect) > 0 ? Number(aspect) : 16 / 9;
  const fittedWidth = Math.min(viewportWidth, viewportHeight * ratio), fittedHeight = fittedWidth / ratio;
  const scale = SCALE_LEVELS[Math.max(0, Math.min(SCALE_LEVELS.length - 1, Math.round(Number(scaleIdx) || 0)))];
  const dpr = effectivePixelRatio({cssWidth: viewportWidth, cssHeight: viewportHeight, devicePixelRatio, screenWidth, screenHeight});
  const requestedWidth = Math.max(16, Math.round(fittedWidth * dpr * scale));
  const requestedHeight = Math.max(16, Math.round(fittedHeight * dpr * scale));
  const limit = Math.max(16, Math.floor(Number(maxSize) || 8192));
  const factor = Math.min(1, limit / requestedWidth, limit / requestedHeight);
  return {width: Math.max(16, Math.floor(requestedWidth * factor)), height: Math.max(16, Math.floor(requestedHeight * factor)),
    requestedWidth, requestedHeight, cssWidth: fittedWidth, cssHeight: fittedHeight, scale, dpr, capped: factor < 1};
}

// Sensor diagonal always equals 36×24mm full frame. All fields are mm except
// apertureRadius/focusDistance (world metres), and FOV values (degrees).
export function getPhotoOptics(settings = {}, aspect) {
  const current = normalizePhotoSettings(settings);
  const requestedAspect = Number(aspect ?? current.width / current.height);
  const ratio = Number.isFinite(requestedAspect) && requestedAspect > 0 ? requestedAspect : 16 / 9;
  const sensorHeight = PHOTO_SENSOR_DIAGONAL / Math.hypot(ratio, 1), sensorWidth = sensorHeight * ratio;
  const tanVFov = sensorHeight / (2 * current.focalLength);
  return {aspect: ratio, sensorWidth, sensorHeight, sensorDiagonal: PHOTO_SENSOR_DIAGONAL,
    focalLength: current.focalLength, tanVFov,
    verticalFov: 2 * Math.atan(tanVFov) * 180 / Math.PI,
    diagonalFov: 2 * Math.atan(PHOTO_SENSOR_DIAGONAL / (2 * current.focalLength)) * 180 / Math.PI,
    shiftX: current.shiftEnabled ? current.shiftX / current.focalLength : 0,
    shiftY: current.shiftEnabled ? current.shiftY / current.focalLength : 0,
    apertureRadius: current.focalLength / current.aperture / 2000,
    focusDistance: current.focusInfinity ? Infinity : current.focusDistance, dof: current.dof};
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const addScaled = (a, b, scale) => a.map((value, i) => value + b[i] * scale);
const normalized = a => {const length = Math.hypot(...a); return a.map(value => value / length);};

// CPU reference for tracing/picking: basis vectors must be orthonormal; UV is
// full-frame with (0,0) at top-left. lensSample is an already uniform disk
// sample in [-1,1]. Picking passes dof:false for a deterministic pinhole ray.
// Positive shifts look right/up. Focus distance is along the forward axis,
// not radial distance along the pixel's oblique ray.
export function createPhotoRay({origin, forward, right, up, uv = [.5, .5], optics,
  lensSample = [0, 0], dof = optics.dof}) {
  const horizontal = (2 * uv[0] - 1) * optics.aspect * optics.tanVFov + optics.shiftX;
  const vertical = (1 - 2 * uv[1]) * optics.tanVFov + optics.shiftY;
  const pinholeDirection = normalized(addScaled(addScaled(forward, right, horizontal), up, vertical));
  if (!dof || optics.apertureRadius <= 0) return {origin: [...origin], direction: pinholeDirection};
  const lensOrigin = addScaled(addScaled(origin, right, lensSample[0] * optics.apertureRadius), up, lensSample[1] * optics.apertureRadius);
  if (!Number.isFinite(optics.focusDistance)) return {origin: lensOrigin, direction: pinholeDirection};
  const distance = optics.focusDistance / dot(pinholeDirection, forward);
  const target = addScaled(origin, pinholeDirection, distance);
  return {origin: lensOrigin, direction: normalized(target.map((value, i) => value - lensOrigin[i]))};
}
