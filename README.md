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
library/models/*         3D models (.glb / .gltf / .obj / .stl)
library/textures/*       images (.png .jpg .webp .gif .bmp) and looping videos (.mp4 .webm .mov)
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

## Textures

Any ISF `image` input other than a filter's `inputImage` becomes a texture slot. Each slot has a picker with a thumbnail, a dropdown and a **Load…** button. A slot can take:

- a file from `library/textures/` (images, or videos that loop muted),
- a built-in procedural texture (checker, grid, noise, meat, rust; all tileable),
- **Layers below**, which is whatever the stack has drawn so far.

To add a texture, drop an image or video on the canvas, or click one in the library list. It goes onto the selected layer's first texture slot. If that layer has no slot, it's added as a new `image` layer instead. Replacing a file on disk hot-reloads it everywhere.

Shaders built around textures:

- `image`: show a texture with contain, cover, stretch or tile fit, plus zoom, spin, scroll and a beat pulse.
- `texture-tunnel`: a textured tunnel that lurches forward on each beat.
- `displace-map`: use any texture as a displacement map or stain over the stack.

The presets `gullet` and `foundry` use them. Model layers have a texture slot too, described below.

In your own shaders, declare `{ "NAME": "tex", "TYPE": "image", "DEFAULT": "@noise" }`. The string `DEFAULT` is a Gumpkestra extension that other ISF hosts ignore. Textures repeat and are mipmapped. They're stored bottom-up like the render targets, so `IMG_NORM_PIXEL(tex, uv)` comes out upright.

## 3D models

Drop a `.glb`, `.gltf` (embedded), `.obj` or `.stl` onto the canvas, or use **Load…** in a model layer's parameters. The file is copied into `library/models/` and added as a **3D** layer. You can also click a model, or a built-in shape (sphere, cube, torus, knot), in the library list. If you re-export over the same file from Blender, every layer showing it reloads.

A model layer sits in the stack like a generator, so the effects below it and the modulators work on it as usual. It's transparent around the model, so it can overlay other layers. Everything is normalised to unit size, so any model frames the same way.

- **Animation:** glTF skins and node animations play. Pick the clip from the dropdown, and modulate **Anim speed** (for example, a dancer that speeds up with the bass).
- **Transform:** scale, spin and tumble (integrated, so modulating them makes the model lurch rather than jump), rotation, offset, zoom and FOV.
- **Deform (GPU):** inflate, writhe (noise along the normals), spectrum spikes (the FFT mapped up the model's height), twist, explode/shatter (per triangle), melt, PSX vertex snap and affine texture warp.
- **Copies:** a ring of instances, with a radius and its own spin.
- **Texture:** keep the model's own materials, or override them with any texture, including the layers below (for example, a model wrapped in the live `flesh` generator). Choose model UVs or box (triplanar) mapping (box mapping is for STL files and other models without UVs), and set scale and scroll.
- **Look:** Lit, Flat, Unlit, Normals, X-ray (additive fresnel) or Wireframe shading. There's also tint, wet specular, rim light, light angle, a wire overlay, fog, and a nearest-neighbour texture toggle.

Presets `relic`, `scrapyard` and `spectral` show it off using the built-in shapes.

Not supported yet: Draco/meshopt-compressed files, morph targets, `.gltf` with an external `.bin`, and materials beyond the base colour and texture.

## Design decisions

- **ISF as the shader format.** Arkestra uses it, there's an existing ecosystem of shaders, and the JSON header gives the UI everything it needs to build controls automatically.
- **Web stack (Vite + TypeScript + WebGL2), no framework.** It's the fastest loop for a prototype, and hot reload works for free. Rendering and audio sit behind small classes (`Engine`, `AudioEngine`), so the app can later be wrapped in Tauri or Electron for a native window, Syphon/Spout and file-system access without a rewrite.
- **Models are rendered by a small built-in mesh renderer, not three.js.** It shares the engine's WebGL context, so there's no state juggling between two renderers. Every vertex goes through the same skinning path (a rigid mesh is a mesh with one joint), and meshes are stored as a triangle soup, so per-triangle effects (shatter, wireframe) need no geometry shader.
- **Modulation lives in the host, not in shaders.** Shaders stay portable, and one shader can be wired to the bass in one preset and to an LFO in another.

## Roadmap ideas

- **Audio:** BPM tracking and tempo-synced LFOs, per-band beat detection (snare/hat), Ableton Link, and a MIDI/OSC learn mode for parameters.
- **Sources:** webcam as a texture, animated GIFs (only the first frame is used today), and video playback controls (scrub, speed, sync to BPM). Real datamoshing with motion vectors would need decoding below the `<video>` element (WebCodecs).
- **Output:** offline render (step frame by frame through an audio file for a perfect-quality export instead of real-time capture), a second output window, and Syphon/NDI via a native shell.
- **Library:** shader thumbnails, tags and categories from the `CATEGORIES` field, a preset browser with previews, and AI-assisted shader generation from a prompt (Arkestra Studio has this).
- **Editor:** CodeMirror with GLSL highlighting, and inline error markers.
- **3D:** an editable mesh-shader format, so the deformers and shading are library files like the ISF effects, plus more lights, a camera path, and normal or roughness maps.
- **Graph mode:** a node graph instead of a linear stack, for routing (for example, feeding one layer's output into another's second image input).
