# Gumpkestra

A prototype modular audio-visualiser, in the spirit of Arkestra (ISF shader engine, audio-reactive layers) and Mosh Pro (an effect stack where any parameter can be driven by modulators).

```sh
npm install
npm run dev            # open http://localhost:5173 in Chrome
npm run check-shaders  # compile every library shader in headless Chrome (add -- --shots for preset screenshots)
```

Drop an audio file on the canvas, use **Use input** to pick a mic or loopback device (for example BlackHole, to get DAW or system audio), or use **Tab audio** to capture a browser tab.

Keys: `space` play/pause · `h` hide UI · `f` fullscreen · `⌘S` save the shader in the editor.

## How it fits together

```
 audio source ─► AudioEngine ──► features (level, bass, lowMid, mid, high, beat, beatCount)
 (file/mic/tab)      │                 │
                     │                 ├─► Modulators ─► param values  (Mosh Pro-style)
                     │                 └─► AUDIO_* built-in uniforms
                     └─► FFT + waveform 256×1 textures ─► ISF audio / audioFFT inputs

 Layer stack (top → bottom, like Mosh Pro's effect list)
   [GEN] nebula        ── drawn, blended onto black
   [GEN] radial-spec.  ── drawn, blended (screen) over the above
   [FX]  feedback-zoom ── receives everything above as inputImage, result blended back
   [FX]  rgb-split
   ...                 ─► canvas / recorder
```

- **Generators** are ISF shaders without an `inputImage`. **Effects** have one. Both kinds share the same stack, with blend mode, opacity and enable toggle per layer.
- **Multipass and feedback** use ISF `PASSES` with `PERSISTENT` targets. Every target is double-buffered, so a pass can read its own previous frame. `feedback-zoom` and `glitch-mosh` use this.
- **Modulators** can be attached to any float parameter, and to layer opacity, with the ∿ button. Sources are level, the four bands, the beat envelope, sine/saw/square LFOs, random-on-beat, and beat-step (a ramp from 0 to 1 over N beats). The offset is `amount × (max − min)`, so it means the same thing on every parameter. The pink marker on each slider shows the live modulated value.
- **Events** (ISF `event` inputs) can fire on every detected beat.

## The library

The library is plain files on disk, so you can version it with git, share it, and edit it in any editor:

```
library/shaders/*.fs     ISF 2 fragment shaders
library/presets/*.json   layer stacks (shader + blend + opacity + params + modulators)
```

The Vite dev server serves these through `/api/library/*` and pushes a `library-changed` event when a file changes. Saving in VS Code recompiles every layer that uses the shader, without reloading the page. The built-in editor also recompiles as you type. Errors are mapped back to the file's line numbers, and a broken shader keeps showing its last good version.

### Writing a shader

Standard ISF: you can paste in shaders from [editor.isf.video](https://editor.isf.video) or the VDMX/Arkestra libraries. Gumpkestra adds these built-ins on top of the ISF ones (`TIME`, `RENDERSIZE`, `PASSINDEX`, `FRAMEINDEX`, `DATE`, `TIMEDELTA`):

| Uniform | Meaning |
|---|---|
| `AUDIO_LEVEL`, `AUDIO_BASS`, `AUDIO_LOWMID`, `AUDIO_MID`, `AUDIO_HIGH` | 0..1, auto-gained and smoothed |
| `AUDIO_BEAT` | 1 on a detected kick, decays to 0 |
| `BEAT_COUNT` | int, increments on each beat (use it to seed per-beat randomness) |
| `AUDIO_FFT`, `AUDIO_WAVE` | 256×1 textures (log-frequency spectrum, and waveform centred on 0.5) |

For shaders you want to share with other ISF hosts, prefer exposing a float parameter and modulating it over reading `AUDIO_*` directly.

## Design decisions

- **ISF as the shader format.** Arkestra uses it, there's an existing ecosystem of shaders, and the JSON header gives the UI everything it needs to build controls automatically.
- **Web stack (Vite + TypeScript + WebGL2), no framework.** It's the fastest loop for a prototype, and hot reload works for free. Rendering and audio sit behind small classes (`Engine`, `AudioEngine`), so the app can later be wrapped in Tauri or Electron for a native window, Syphon/Spout and file-system access without a rewrite.
- **Modulation lives in the host, not in shaders.** Shaders stay portable, and one shader can be wired to the bass in one preset and to an LFO in another.

## Roadmap ideas

- **Audio:** BPM tracking and tempo-synced LFOs, per-band beat detection (snare/hat), Ableton Link, and a MIDI/OSC learn mode for parameters.
- **Sources:** video and image layers, and webcam. These are needed for Mosh Pro-style processing of footage, including real datamoshing with motion vectors.
- **Output:** offline render (step frame by frame through an audio file for a perfect-quality export instead of real-time capture), a second output window, and Syphon/NDI via a native shell.
- **Library:** shader thumbnails, tags and categories from the `CATEGORIES` field, a preset browser with previews, and AI-assisted shader generation from a prompt (Arkestra Studio has this).
- **Editor:** CodeMirror with GLSL highlighting, and inline error markers.
- **Graph mode:** a node graph instead of a linear stack, for routing (for example, feeding one layer's output into another's second image input).
