/** An optional session-wide cameo: three brief text flashes every five minutes. */
export class MitchFlash {
  startedAt = performance.now() / 1000;
  readonly texture: WebGLTexture;
  private _enabled = false;

  get enabled() {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (value && !this._enabled) this.startedAt = performance.now() / 1000;
    this._enabled = value;
  }

  constructor(gl: WebGL2RenderingContext) {
    const canvas = Object.assign(document.createElement('canvas'), { width: 2048, height: 512 });
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'italic 900 220px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'white';
    ctx.save();
    ctx.translate(1024, 237);
    ctx.scale(Math.min(1, 1840 / ctx.measureText('mitch was here').width), 1.35);
    ctx.fillText('mitch was here', 0, 0);
    ctx.restore();

    // Repeatable cuts and drips distress the letters without an external font.
    let seed = 1937;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 100; i++) {
      const x = Math.floor(140 + random() * 1768);
      for (let y = 350; y >= 220; y--) {
        if (pixels.data[(y * canvas.width + x) * 4 + 3] < 200) continue;
        ctx.beginPath();
        ctx.moveTo(x - 2, y); ctx.lineTo(x + 3, y);
        ctx.lineTo(x + (random() - 0.5) * 8, y + 12 + random() * 90);
        ctx.fill();
        break;
      }
    }
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 110; i++) {
      const x = random() * 2048, y = 110 + random() * 240;
      ctx.fillRect(x, y, 4 + random() * 38, 1 + random() * 3);
    }
    ctx.globalCompositeOperation = 'source-over';

    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  phaseAt(time: number) {
    if (!this._enabled) return -1;
    const elapsed = time - this.startedAt;
    if (elapsed < 300) return -1;
    const phase = (elapsed - 300) % 300;
    return phase < 2.6 ? phase : -1;
  }
}
