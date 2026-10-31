/** Decode locally and mix all channels equally into the mono analysis signal. */
export async function importAudio(file: File): Promise<{ samples: Float32Array<ArrayBuffer>; sampleRate: number }> {
  if (file.size === 0) throw new Error('The selected file is empty.');
  const context = new AudioContext({ sampleRate: 48000 });
  try {
    let decoded: AudioBuffer;
    try {
      decoded = await context.decodeAudioData(await file.arrayBuffer());
    } catch {
      throw new Error('Could not decode this audio file. It may be unsupported or too large for this browser or device.');
    }
    if (!decoded.length || !decoded.numberOfChannels) throw new Error('The file contains no audio.');
    const samples = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) samples[i] = samples[i]! + data[i]! / decoded.numberOfChannels;
    }
    return { samples, sampleRate: decoded.sampleRate };
  } finally {
    await context.close();
  }
}
