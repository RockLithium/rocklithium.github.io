import createJxrModule from './vendor/jxr-encoder.js';

let createJxrModulePromise;

function loadCodec() {
  if (!createJxrModulePromise) {
    createJxrModulePromise = createJxrModule({
      locateFile: (name) => new URL(`./vendor/${name}`, self.location.href).href,
    });
  }
  return createJxrModulePromise;
}

self.onmessage = async (event) => {
  const { pixels, width, height } = event.data || {};
  try {
    if (!(pixels instanceof ArrayBuffer)) throw new TypeError('Expected a transferred Float32 RGBA ArrayBuffer.');
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError('Invalid JPEG XR frame dimensions.');
    }
    if (pixels.byteLength !== width * height * 4 * Float32Array.BYTES_PER_ELEMENT) {
      throw new RangeError('The Float32 RGBA buffer does not match the frame dimensions.');
    }

    const codec = await loadCodec();
    const pixelPointer = codec._jxr_alloc(pixels.byteLength);
    if (!pixelPointer) throw new Error('Unable to allocate the JPEG XR input frame.');
    let encoded;
    try {
      codec.HEAPF32.set(new Float32Array(pixels), pixelPointer >>> 2);
      const status = codec._jxr_encode_rgba_float(pixelPointer, width, height);
      if (status !== 0) {
        const detail = codec._jxr_get_last_error();
        throw new Error(`JPEG XR encoder failed (code ${detail || status}).`);
      }
      const outputPointer = codec._jxr_get_output();
      const outputLength = codec._jxr_get_output_size();
      if (!outputPointer || !outputLength) throw new Error('JPEG XR encoder returned an empty image.');
      encoded = codec.HEAPU8.slice(outputPointer, outputPointer + outputLength).buffer;
    } finally {
      codec._jxr_release_output();
      codec._jxr_free(pixelPointer);
    }
    self.postMessage({ width, height, buffer: encoded }, [encoded]);
  } catch (error) {
    self.postMessage({ width, height, error: error instanceof Error ? error.message : String(error) });
  }
};
