/**
 * Getting at the microphone and camera, and knowing when someone is talking.
 *
 * Ported from GhostChat's `services/webrtc/media.ts`. The error handling is the
 * valuable part: `getUserMedia` fails in several genuinely different ways, and
 * a caller who catches them all as "couldn't start your mic" leaves the person
 * with no idea whether to change a setting, plug something in, or give up.
 */

/** What went wrong, in words a person can act on. */
export class MediaError extends Error {
  readonly kind: 'insecure' | 'unsupported' | 'denied' | 'missing' | 'unknown';
  constructor(kind: MediaError['kind'], message: string) {
    super(message);
    this.kind = kind;
    this.name = 'MediaError';
  }
}

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

function videoConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

export interface MediaRequest {
  audio: boolean;
  video: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
}

export async function getLocalMedia(req: MediaRequest): Promise<MediaStream> {
  /*
    A SECURE CONTEXT IS REQUIRED, AND THIS IS THE CONFUSING ONE.

    Browsers only expose the mic and camera over HTTPS or on localhost. Open the
    site by LAN IP over plain HTTP — which is exactly what you do when testing on
    a phone against a laptop — and `navigator.mediaDevices` is simply undefined.
    Not an error, not a denied permission: absent. Without this check that
    surfaces as "this browser can't access your mic", which sends you looking in
    entirely the wrong place.
  */
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    throw new MediaError(
      'insecure',
      'Calls need a secure connection. Open StudyQuest over https (or on localhost) to use your mic and camera.'
    );
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new MediaError('unsupported', "This browser can't access your mic or camera.");
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: req.audio
        ? {
            ...AUDIO_CONSTRAINTS,
            ...(req.audioDeviceId ? { deviceId: { exact: req.audioDeviceId } } : {}),
          }
        : false,
      video: req.video ? videoConstraints(req.videoDeviceId) : false,
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError') {
      throw new MediaError(
        'denied',
        'Permission was refused. Allow the mic and camera for this site in your browser settings, then try again.'
      );
    }
    if (name === 'NotFoundError') {
      throw new MediaError('missing', 'No microphone or camera was found on this device.');
    }
    throw new MediaError('unknown', "Couldn't start your mic or camera.");
  }
}

/**
 * Report when this stream is carrying speech.
 *
 * Purely cosmetic — it lights a ring around whoever is talking — but in a call
 * with four silent tiles it is the thing that tells you the call is alive and
 * who to listen to. Returns its own cleanup, and closes the AudioContext, which
 * otherwise keeps the tab's audio hardware awake after the call ends.
 */
export function createVad(stream: MediaStream, onChange: (speaking: boolean) => void): () => void {
  if (stream.getAudioTracks().length === 0) return () => {};

  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return () => {};

  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);

  let speaking = false;
  const interval = window.setInterval(() => {
    analyser.getByteTimeDomainData(data);
    // RMS deviation from the 128 midpoint, normalised to 0..1.
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const next = rms > 0.02;
    if (next !== speaking) {
      speaking = next;
      onChange(speaking);
    }
  }, 250);

  return () => {
    window.clearInterval(interval);
    source.disconnect();
    void ctx.close();
  };
}

/** Stop every track on a stream. Skipping this leaves the camera light on. */
export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
