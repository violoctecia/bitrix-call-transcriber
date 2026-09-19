export const TARGET_RATE = 8000;

const MAX_SEGMENT_SEC = 24;

const PAUSE_MS = 400;

const MIN_SPEECH_MS = 320;

const FRAME_MS = 20;

export async function decodeToMono(bytes) {
  const ctx = new AudioContext();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(bytes.slice(0));
  } finally {
    ctx.close();
  }

  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET_RATE), TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const mono = await offline.startRendering();

  return {
    samples: mono.getChannelData(0),
    rate: TARGET_RATE,
    durationMs: Math.round(decoded.duration * 1000),
    sourceChannels: decoded.numberOfChannels,
    sourceRate: decoded.sampleRate,
  };
}

export function speechSegments(samples, rate = TARGET_RATE) {
  const frame = Math.round((rate * FRAME_MS) / 1000);
  const energies = [];
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let sum = 0;
    for (let j = i; j < i + frame; j++) sum += samples[j] * samples[j];
    energies.push(Math.sqrt(sum / frame));
  }
  if (!energies.length) return [];

  const threshold = noiseFloor(energies);
  const framesInPause = Math.round(PAUSE_MS / FRAME_MS);

  const out = [];
  let start = -1;
  let silence = 0;
  for (let i = 0; i < energies.length; i++) {
    const loud = energies[i] > threshold;
    if (loud) {
      if (start < 0) start = i;
      silence = 0;
      continue;
    }
    if (start < 0) continue;
    silence++;
    if (silence >= framesInPause) {
      push(out, start, i - silence + 1);
      start = -1;
      silence = 0;
    }
  }
  if (start >= 0) push(out, start, energies.length);

  return out.flatMap(splitLong).filter((s) => s.endMs - s.startMs >= MIN_SPEECH_MS);

  function push(list, from, to) {
    list.push({ startMs: from * FRAME_MS, endMs: to * FRAME_MS });
  }
}

function noiseFloor(energies) {
  const sorted = [...energies].sort((a, b) => a - b);
  const quiet = sorted[Math.floor(sorted.length * 0.3)] || 0;
  const loud = sorted[Math.floor(sorted.length * 0.95)] || 0;
  return Math.max(quiet * 3, loud * 0.06, 0.004);
}

function splitLong(segment) {
  const maxMs = MAX_SEGMENT_SEC * 1000;
  if (segment.endMs - segment.startMs <= maxMs) return [segment];
  const parts = [];
  for (let from = segment.startMs; from < segment.endMs; from += maxMs) {
    parts.push({ startMs: from, endMs: Math.min(from + maxMs, segment.endMs) });
  }
  return parts;
}

export function toLPCM(samples, startMs, endMs, rate = TARGET_RATE) {
  const from = Math.max(0, Math.floor((startMs * rate) / 1000));
  const to = Math.min(samples.length, Math.ceil((endMs * rate) / 1000));
  const out = new Int16Array(Math.max(0, to - from));
  for (let i = from; i < to; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out[i - from] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out.buffer;
}
