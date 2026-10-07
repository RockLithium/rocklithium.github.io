// Creative linear-light grading, applied after scene exposure and before either
// SDR tone mapping or the HDR shoulder. This temperature/tint approximation is
// an artistic white-balance adjustment, not calibrated chromatic adaptation.
const LUMA = [.2126, .7152, .0722];
const bounded = (value, fallback, min, max) => {
  const number = value == null ? fallback : Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};
const positive = (value, fallback = 1) => bounded(value, fallback, 1, 1e9);
const channel = value => Number.isFinite(value) && value >= 0 ? value : 0;

export function getPhotoColorTransform(state = {}) {
  const temperature = bounded(state?.temperature, 6500, 2000, 12000);
  const tint = bounded(state?.tint, 0, -100, 100);
  let whiteBalance = [1, 1, 1];
  const autoBalance = state?.autoBalance;
  if (state?.autoWhiteBalance === true && [0, 1, 2].every(i => Number.isFinite(autoBalance?.[i]) && autoBalance[i] > 0)) {
    // The estimator preserves its sample's linear luminance. Do not normalize
    // these gains a second time against a different (unit-white) reference.
    whiteBalance = [0, 1, 2].map(i => Math.max(.5, Math.min(2, autoBalance[i])));
  } else if (temperature !== 6500 || tint !== 0) {
    // Higher Kelvin settings warm the image; positive tint adds magenta.
    const warmth = .45 * Math.log(temperature / 6500), magenta = Math.exp(tint / 400);
    whiteBalance = [Math.exp(warmth) * magenta, 1 / magenta, Math.exp(-warmth) * magenta];
    const luminance = whiteBalance.reduce((sum, value, i) => sum + value * LUMA[i], 0);
    whiteBalance = whiteBalance.map(value => value / luminance);
  }
  return {
    whiteBalance,
    contrast: bounded(state?.contrast, 100, 0, 200) / 100,
    saturation: bounded(state?.saturation, 100, 0, 200) / 100,
    grain: .04 * bounded(state?.grain, 0, 0, 100) / 100,
  };
}

// Approximate, deliberately mild gray-world balance, not camera spectral
// calibration. Input is raw linear RGB(A), before WB, grading or tone mapping.
// stride counts components per pixel (RGBA by default); optional width/height
// bound the sampled image when the backing array has trailing storage.
export function estimatePhotoWhiteBalance(values, {stride = 4, width, height} = {}) {
  if (!values || !Number.isFinite(values.length)) return [1, 1, 1];
  const step = Math.floor(bounded(stride, 4, 3, 64));
  let count = Math.floor(values.length / step);
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    count = Math.min(count, Math.floor(width) * Math.floor(height));
  }
  const samples = [];
  for (let pixel = 0; pixel < count; pixel++) {
    const offset = pixel * step, r = values[offset], g = values[offset + 1], b = values[offset + 2];
    if (![r, g, b].every(value => Number.isFinite(value) && value >= 0)) continue;
    const high = Math.max(r, g, b), low = Math.min(r, g, b);
    const luminance = r * LUMA[0] + g * LUMA[1] + b * LUMA[2];
    if (luminance <= 1e-4 || luminance > 64 || (high - low) / high > .6) continue;
    samples.push({rgb: [r, g, b], luminance});
  }
  if (samples.length < 8) return [1, 1, 1];
  const ordered = samples.map(sample => sample.luminance).sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  const emitterLimit = Math.max(4, median * 8), average = [0, 0, 0];
  let accepted = 0;
  for (const {rgb, luminance} of samples) {
    if (luminance > emitterLimit) continue;
    // Equal chromaticity weight prevents a bright window or lamp dominating.
    rgb.forEach((value, i) => { average[i] += value / luminance; });
    accepted++;
  }
  if (accepted < 8) return [1, 1, 1];
  average.forEach((value, i) => { average[i] = value / accepted; });
  if (average.every(value => Math.abs(value - 1) < 1e-6)) return [1, 1, 1];
  const correction = average.map(value => 1 / value - 1);
  // Blending all channels by the same strength retains average linear luma,
  // including HDR samples. Reduce strength to keep every gain in [.5, 2].
  let strength = .65;
  for (const delta of correction) {
    if (delta > 0) strength = Math.min(strength, 1 / delta);
    else if (delta < 0) strength = Math.min(strength, -.5 / delta);
  }
  return correction.map(delta => Math.max(.5, Math.min(2, 1 + strength * delta)));
}

// Use the FINAL output dimensions here and pass this grid to both preview and
// export. Pixel centers map through normalized top-left image coordinates, so
// the grain composition stays fixed when preview resolution or samples change.
export function getPhotoGrainGrid(width, height) {
  const w = Math.floor(positive(width)), h = Math.floor(positive(height));
  return {grainWidth: w, grainHeight: h};
}

// A preview pixel covers many independent output grains. Attenuate by the
// square root of that footprint area, keeping reduced previews from sparkling.
// Final output and every output tile retain full per-pixel grain strength.
export function photoGrainStrength(width, height, grainWidth, grainHeight) {
  return Math.min(1, Math.sqrt(positive(width) / positive(grainWidth) * positive(height) / positive(grainHeight)));
}

// GPU reference: uint multiplication wraps at 32 bits; ^ is bitwise XOR and
// >> is an unsigned uint shift. The 24-bit result converts exactly to float32.
export function photoGrainNoise(x, y) {
  let hash = (Math.imul(x, 1973) ^ Math.imul(y, 9277) ^ 0x68bc21eb) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return (hash & 0x00ffffff) / 16777216 - .5;
}

export function applyPhotoColor(rgb, transform = getPhotoColorTransform(), options = {}) {
  const wb = transform?.whiteBalance ?? [1, 1, 1];
  const contrast = bounded(transform?.contrast, 1, 0, 2);
  const saturation = bounded(transform?.saturation, 1, 0, 2);
  const grain = bounded(transform?.grain, 0, 0, .04);
  const gains = [0, 1, 2].map(i => bounded(wb[i], 1, 0, 10));
  const input = [0, 1, 2].map(i => channel(rgb?.[i]));
  // Avoid even rounding changes in the neutral path, including finite HDR RGB.
  if (gains.every(value => value === 1) && contrast === 1 && saturation === 1 && grain === 0) return input;
  const color = input.map((value, i) => value * gains[i]);
  const luminance = color.reduce((sum, value, i) => sum + value * LUMA[i], 0);
  let noise = 0;
  if (grain > 0) {
    const width = positive(options?.width), height = positive(options?.height);
    const grid = getPhotoGrainGrid(width, height);
    const grainWidth = Math.floor(positive(options?.grainWidth, grid.grainWidth));
    const grainHeight = Math.floor(positive(options?.grainHeight, grid.grainHeight));
    const x = bounded(options?.x, 0, 0, width - 1), y = bounded(options?.y, 0, 0, height - 1);
    const ix = Math.min(grainWidth - 1, Math.floor((x + .5) / width * grainWidth));
    const iy = Math.min(grainHeight - 1, Math.floor((y + .5) / height * grainHeight));
    noise = photoGrainNoise(ix, iy) * grain * photoGrainStrength(width, height, grainWidth, grainHeight);
  }
  // GPU order: WB -> mix(luminance, color, saturation) -> contrast about .18
  // -> nonnegative clamp -> monochrome grain -> final nonnegative clamp.
  return color.map(value => Math.max(0,
    Math.max(0, (luminance + (value - luminance) * saturation - .18) * contrast + .18) + noise));
}
