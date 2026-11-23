import { link } from './gl';

/** Special texture identifier for the live camera feed. */
export const CAMERA_TEXTURE = '@camera';

export type CameraStatus = 'idle' | 'starting' | 'active' | 'error';

export interface CameraSettings {
  /** Preferred videoinput deviceId ('' = browser default camera). */
  deviceId: string;
  /** Flip the camera feed horizontally. */
  mirror: boolean;
}

export interface CameraTextureInfo {
  tex: WebGLTexture;
  width: number;
  height: number;
  video: HTMLVideoElement;
  dirty: boolean;
  idle: number;
}

const STORAGE_KEY = 'gumpkestra:camera-settings';
/** Frames with no layer reading `@camera` before stopping the stream and turning off the webcam LED. */
const IDLE_FRAMES = 90;

const MIRROR_VS = `#version 300 es
out vec2 vUV;
void main() {
  vec2 pos = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUV = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const MIRROR_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 color;
uniform sampler2D src;
void main() {
  color = texture(src, vec2(1.0 - vUV.x, 1.0 - vUV.y));
}`;

function loadSettings(): CameraSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      return {
        deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : '',
        mirror: raw.mirror === true,
      };
    }
  } catch {
    /* storage unavailable — use defaults */
  }
  return { deviceId: '', mirror: false };
}

function describeCameraError(err: unknown): string {
  const e = err as { name?: string; message?: string } | null;
  switch (e?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera permission denied. Allow camera access in your browser and click Retry.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera found.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Camera is in use by another app.';
    case 'OverconstrainedError':
      return 'Selected camera is unavailable.';
    case 'AbortError':
      return 'Camera startup was interrupted.';
    default:
      return e?.message || 'Could not start camera.';
  }
}

function setRepeatLinear(gl: WebGL2RenderingContext) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
}

/**
 * Manages a live webcam MediaStream and uploads frames into a shared WebGL2 texture (`@camera`).
 * Starts automatically when a layer samples `@camera` and releases the camera tracks after a brief
 * idle period when no layer uses it (or immediately when stopped by the user).
 */
export class CameraTexture {
  readonly tex: WebGLTexture;
  status: CameraStatus = 'idle';
  error: string | null = null;
  /** True when explicitly stopped by the user so active layers don't immediately re-open it. */
  paused = false;
  deviceLabel = '';
  width = 0;
  height = 0;
  video: HTMLVideoElement | null = null;
  stream: MediaStream | null = null;
  devices: MediaDeviceInfo[] = [];
  settings: CameraSettings = loadSettings();
  /** Optional notification hook for surfacing startup/disconnect errors. */
  onError?: (message: string) => void;

  private hasFrame = false;
  private dirty = false;
  private idle = 0;
  private requestId = 0;
  private vfcId: number | null = null;
  private listeners = new Set<() => void>();

  // Lazily allocated GPU resources for horizontal mirroring.
  private rawTex: WebGLTexture | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private mirrorProg: WebGLProgram | null = null;
  private mirrorSrcLoc: WebGLUniformLocation | null = null;
  private emptyVao: WebGLVertexArrayObject | null = null;
  private mirroredSize: [number, number] | null = null;

  constructor(private gl: WebGL2RenderingContext) {
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    setRepeatLinear(gl);

    void this.listDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', () => {
      void this.listDevices();
    });
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  private saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage unavailable — settings still apply for this session */
    }
  }

  /** Called by layers each frame when sampling `@camera`. */
  get(): WebGLTexture | null {
    this.idle = 0;
    if (this.status === 'active' && this.hasFrame) return this.tex;
    if (this.status === 'idle' && !this.paused) void this.start();
    return null;
  }

  /** Dimensions and video element for tile sequences once a frame has been uploaded. */
  info(): CameraTextureInfo | undefined {
    if (this.status !== 'active' || !this.hasFrame || !this.video) return undefined;
    return { tex: this.tex, width: this.width, height: this.height, video: this.video, dirty: this.dirty, idle: this.idle };
  }

  /** Explicitly start/resume the camera (e.g. from a user click in the UI). */
  activate() {
    this.paused = false;
    this.idle = 0;
    if (this.status === 'idle' || this.status === 'error') void this.start();
    else this.emit();
  }

  retry() {
    this.activate();
  }

  selectDevice(deviceId: string) {
    this.settings.deviceId = deviceId;
    this.saveSettings();
    this.paused = false;
    if (this.status === 'active' || this.status === 'starting' || this.status === 'error') {
      void this.start(deviceId);
    } else {
      this.emit();
    }
  }

  setMirror(mirror: boolean) {
    if (this.settings.mirror === mirror) return;
    this.settings.mirror = mirror;
    this.saveSettings();
    if (this.status === 'active') this.dirty = true;
    this.emit();
  }

  async listDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter((d) => d.kind === 'videoinput' && d.deviceId);
      const changed = cams.length !== this.devices.length
        || cams.some((d, i) => d.deviceId !== this.devices[i]?.deviceId || d.label !== this.devices[i]?.label);
      this.devices = cams;
      if (changed) this.emit();
      return cams;
    } catch {
      return [];
    }
  }

  async start(deviceId?: string) {
    const req = ++this.requestId;
    this.paused = false;
    this.idle = 0;

    if (!navigator.mediaDevices?.getUserMedia) {
      this.releaseStream();
      this.status = 'error';
      this.error = 'Camera capture is not available in this browser context (requires HTTPS or localhost).';
      this.emit();
      this.onError?.(this.error);
      return;
    }

    this.releaseStream();
    this.status = 'starting';
    this.error = null;
    this.emit();

    const wantedId = deviceId !== undefined ? deviceId : this.settings.deviceId;
    const requestStream = async (id: string) => {
      const video: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
      if (id) video.deviceId = { exact: id };
      return navigator.mediaDevices.getUserMedia({ video, audio: false });
    };

    let stream: MediaStream;
    try {
      try {
        stream = await requestStream(wantedId);
      } catch (err) {
        const name = (err as { name?: string } | null)?.name;
        // If a saved deviceId was unplugged, fall back cleanly to the default camera.
        if (wantedId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
          if (deviceId === undefined) {
            this.settings.deviceId = '';
            this.saveSettings();
          }
          stream = await requestStream('');
        } else {
          throw err;
        }
      }
    } catch (err) {
      if (req !== this.requestId) return;
      this.status = 'error';
      this.error = describeCameraError(err);
      this.emit();
      this.onError?.(this.error);
      return;
    }

    if (req !== this.requestId) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const video = Object.assign(document.createElement('video'), {
      muted: true,
      playsInline: true,
      autoplay: true,
    });
    video.srcObject = stream;

    try {
      await video.play();
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      if (req !== this.requestId) return;
      this.status = 'error';
      this.error = describeCameraError(err);
      this.emit();
      this.onError?.(this.error);
      return;
    }

    if (req !== this.requestId) {
      video.pause();
      video.srcObject = null;
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const track = stream.getVideoTracks()[0];
    if (track) {
      track.addEventListener('ended', () => {
        if (this.stream !== stream) return;
        this.releaseStream();
        this.status = 'error';
        this.error = 'Camera disconnected.';
        this.emit();
        this.onError?.(this.error);
      });
    }

    this.stream = stream;
    this.video = video;
    this.deviceLabel = track?.label || 'Camera';
    this.status = 'active';
    this.error = null;
    this.hasFrame = false;
    this.dirty = true;
    this.idle = 0;

    if ('requestVideoFrameCallback' in video) {
      const onFrame = () => {
        if (this.video !== video) return;
        this.dirty = true;
        this.vfcId = video.requestVideoFrameCallback(onFrame);
      };
      this.vfcId = video.requestVideoFrameCallback(onFrame);
    }

    void this.listDevices();
    this.emit();
  }

  /** Stop the camera stream and release hardware tracks. */
  stop(manual = false) {
    this.requestId++;
    const hadState = this.status !== 'idle' || this.paused !== manual || this.error !== null;
    this.releaseStream();
    this.status = 'idle';
    this.error = null;
    this.paused = manual;
    this.idle = 0;
    if (hadState) this.emit();
  }

  private releaseStream() {
    if (this.video) {
      if (this.vfcId !== null && 'cancelVideoFrameCallback' in this.video) {
        this.video.cancelVideoFrameCallback(this.vfcId);
      }
      this.video.pause();
      this.video.srcObject = null;
    }
    this.vfcId = null;
    this.video = null;
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach((t) => t.stop());
    this.deviceLabel = '';
    this.width = 0;
    this.height = 0;
    this.hasFrame = false;
    this.dirty = false;
  }

  /** Per frame: auto-stop if unused, otherwise upload any new camera frame to the GPU. */
  update() {
    if (this.status === 'idle') {
      // Once no layer references @camera for a moment, clear manual pause so future presets start cleanly.
      if (this.paused && ++this.idle > IDLE_FRAMES) {
        this.paused = false;
        this.emit();
      }
      return;
    }

    if (this.status === 'starting') return;
    if (this.status === 'error') {
      // Clear stale error once nothing uses @camera anymore, so re-adding @camera tries fresh.
      if (++this.idle > IDLE_FRAMES) {
        this.status = 'idle';
        this.error = null;
        this.emit();
      }
      return;
    }

    if (++this.idle > IDLE_FRAMES) {
      this.stop(false);
      return;
    }

    const video = this.video;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    const usesCallback = 'requestVideoFrameCallback' in video;
    if (usesCallback && !this.dirty) return;
    this.dirty = false;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const gl = this.gl;

    if (!this.settings.mirror) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      this.mirroredSize = null;
    } else {
      this.uploadMirrored(video, vw, vh);
    }

    const resized = vw !== this.width || vh !== this.height || !this.hasFrame;
    this.width = vw;
    this.height = vh;
    this.hasFrame = true;
    if (resized) this.emit();
  }

  private ensureMirrorResources() {
    if (this.mirrorProg) return;
    const gl = this.gl;
    this.rawTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.rawTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fbo = gl.createFramebuffer()!;
    this.mirrorProg = link(gl, MIRROR_VS, MIRROR_FS);
    this.mirrorSrcLoc = gl.getUniformLocation(this.mirrorProg, 'src');
    this.emptyVao = gl.createVertexArray()!;
  }

  private uploadMirrored(video: HTMLVideoElement, vw: number, vh: number) {
    const gl = this.gl;
    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const prevVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
    const prevProg = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    const prevVp = gl.getParameter(gl.VIEWPORT) as Int32Array;

    this.ensureMirrorResources();

    gl.activeTexture(gl.TEXTURE0);
    if (!this.mirroredSize || this.mirroredSize[0] !== vw || this.mirroredSize[1] !== vh) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, vw, vh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      setRepeatLinear(gl);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
      this.mirroredSize = [vw, vh];
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    }

    gl.bindTexture(gl.TEXTURE_2D, this.rawTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.viewport(0, 0, vw, vh);
    gl.useProgram(this.mirrorProg);
    gl.uniform1i(this.mirrorSrcLoc, 0);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    gl.bindVertexArray(prevVao);
    gl.useProgram(prevProg);
    gl.viewport(prevVp[0], prevVp[1], prevVp[2], prevVp[3]);
  }
}
