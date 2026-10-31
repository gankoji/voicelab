/** Return a new recording, preserving every sample including non-finite gaps. */
export function cutSamples(samples: Float32Array, start: number, end: number): Float32Array<ArrayBuffer> {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > samples.length || end - start === samples.length) {
    throw new RangeError('Select less than the entire recording to cut.');
  }
  const result = new Float32Array(samples.length - (end - start));
  result.set(samples.subarray(0, start));
  result.set(samples.subarray(end), start);
  return result;
}

/** Insert without replacing or modifying either input. */
export function pasteSamples(samples: Float32Array, clip: Float32Array, position: number): Float32Array<ArrayBuffer> {
  if (!Number.isInteger(position) || position < 0 || position > samples.length || clip.length === 0) {
    throw new RangeError('Enter a valid insertion sample.');
  }
  const result = new Float32Array(samples.length + clip.length);
  result.set(samples.subarray(0, position));
  result.set(clip, position);
  result.set(samples.subarray(position), position + clip.length);
  return result;
}
