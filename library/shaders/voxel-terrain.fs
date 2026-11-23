/*{
  "DESCRIPTION": "Raymarched Minecraft-style voxel terrain flyover with procedural 16x16 Minecraft4k dirt and grass block textures, a spherical crater at the origin, distance fog, and optional audio-reactive voxel columns. Ported from an early GLSL Sandbox shader.",
  "CREDIT": "GLSL Sandbox (Minecraft4k textures via PlayMyCode), ported for Gumpkestra",
  "CATEGORIES": ["Generator", "3D", "Retro", "Audio"],
  "INPUTS": [
    { "NAME": "audioFFT", "TYPE": "audioFFT" },
    { "NAME": "speed", "TYPE": "float", "GROUP": "Camera", "LABEL": "Fly speed", "DESCRIPTION": "Forward flyover speed across the voxel terrain", "DEFAULT": 1.0, "MIN": -3.0, "MAX": 3.0 },
    { "NAME": "turnSpeed", "TYPE": "float", "GROUP": "Camera", "LABEL": "Orbit speed", "DESCRIPTION": "Continuous horizontal camera pan rate", "DEFAULT": 0.1, "MIN": -1.0, "MAX": 1.0 },
    { "NAME": "camHeight", "TYPE": "float", "GROUP": "Camera", "LABEL": "Height", "DESCRIPTION": "Camera altitude above the voxel floor", "DEFAULT": 5.0, "MIN": 2.5, "MAX": 16.0 },
    { "NAME": "pitch", "TYPE": "float", "GROUP": "Camera", "LABEL": "Pitch", "DESCRIPTION": "Vertical camera tilt angle", "DEFAULT": -0.2, "MIN": -0.8, "MAX": 0.4 },
    { "NAME": "focus", "TYPE": "float", "GROUP": "Camera", "LABEL": "Focal length", "DESCRIPTION": "Camera lens focal length (zoom)", "DEFAULT": 1.8, "MIN": 0.6, "MAX": 4.0 },
    { "NAME": "terrainHeight", "TYPE": "float", "GROUP": "Terrain", "LABEL": "Max height", "DESCRIPTION": "Maximum random height of terrain block columns", "DEFAULT": 3.0, "MIN": 1.0, "MAX": 8.0 },
    { "NAME": "dirtRatio", "TYPE": "float", "GROUP": "Terrain", "LABEL": "Dirt ratio", "DESCRIPTION": "Proportion of bare dirt columns versus grass-topped columns", "DEFAULT": 0.17, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "texelRes", "TYPE": "float", "GROUP": "Terrain", "LABEL": "Block pixels", "DESCRIPTION": "Procedural texel resolution per voxel block face (16 = classic Minecraft4k)", "DEFAULT": 16.0, "MIN": 4.0, "MAX": 32.0 },
    { "NAME": "craterRadius", "TYPE": "float", "GROUP": "Terrain", "LABEL": "Origin crater", "DESCRIPTION": "Radius of the spherical crater carved at the world origin (0 = off)", "DEFAULT": 5.0, "MIN": 0.0, "MAX": 16.0 },
    { "NAME": "fogDistance", "TYPE": "float", "GROUP": "Terrain", "LABEL": "Draw distance", "DESCRIPTION": "Horizon fog and raymarch draw distance", "DEFAULT": 60.0, "MIN": 15.0, "MAX": 120.0 },
    { "NAME": "spectrumHeight", "TYPE": "float", "GROUP": "Audio", "LABEL": "Spectrum lift", "DESCRIPTION": "Lift individual voxel columns with live audio FFT frequency bands", "DEFAULT": 1.5, "MIN": 0.0, "MAX": 6.0 },
    { "NAME": "beatBounce", "TYPE": "float", "GROUP": "Audio", "LABEL": "Beat hop", "DESCRIPTION": "Bounce camera height gently on detected beats", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 2.0, "MODS": [{ "SOURCE": "beat", "AMOUNT": 0.25 }] },
    { "NAME": "grassColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Grass", "DESCRIPTION": "Grass block top and overhang tint (Minecraft4k #6AAA40)", "DEFAULT": [0.4157, 0.6667, 0.251, 1.0] },
    { "NAME": "dirtColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Dirt", "DESCRIPTION": "Dirt block tint (Minecraft4k #966C4A)", "DEFAULT": [0.5882, 0.4235, 0.2902, 1.0] },
    { "NAME": "skyTop", "TYPE": "color", "GROUP": "Color", "LABEL": "Sky zenith", "DESCRIPTION": "Upper sky colour", "DEFAULT": [0.0, 0.3, 0.9, 1.0] },
    { "NAME": "skyHorizon", "TYPE": "color", "GROUP": "Color", "LABEL": "Sky horizon", "DESCRIPTION": "Horizon and distance fog colour", "DEFAULT": [0.8, 0.8, 0.8, 1.0] },
    { "NAME": "ambient", "TYPE": "float", "GROUP": "Color", "LABEL": "Shadow floor", "DESCRIPTION": "Minimum ambient brightness on shaded block faces", "DEFAULT": 0.3, "MIN": 0.05, "MAX": 1.0 }
  ]
}*/

const vec3 LIGHT_DIR = normalize(vec3(1.0, -0.4, 0.9));

float rand(vec3 p) {
  return fract(sin(dot(p, vec3(37.1, 61.7, 12.4))) * 1233758.5453123);
}

float rand(vec2 p) {
  return rand(vec3(p, 1.0));
}

vec3 sky(vec3 dir) {
  float t = clamp((dot(dir, vec3(0.0, 0.0, -1.0)) + 1.0) * 0.5, 0.0, 1.0);
  return mix(skyTop.rgb, skyHorizon.rgb, t);
}

// Procedural Minecraft4k-style 16x16 dirt & grass block texture.
// `localPos` is the hit position inside the unit block in [0, 0.999]^3.
vec3 blockColor(vec3 localPos, int type) {
  float res = max(4.0, floor(texelRes + 0.5));
  vec3 b = floor(clamp(localPos, 0.0, 0.999) * res);
  vec3 c;
  if (type == 1) {
    // DIRT (#966C4A)
    c = dirtColor.rgb;
  } else if (type == 2) {
    // GRASS (#6AAA40 overhang over dirt)
    c = dirtColor.rgb;
    float x = b.x + b.y;
    float fringe = mod(floor((x * x * 3.0 + x * 67.0) / 4.0), 4.0);
    if (b.z >= res - 1.0 || (b.z + 0.5) / res > (fringe + 11.0) / 16.0) {
      c = grassColor.rgb;
    }
  } else {
    c = vec3(1.0, 0.0, 1.0);
  }
  c *= (255.0 - 96.0 * rand(b)) / 255.0;
  return c;
}

vec4 u(vec4 a, vec4 b) {
  return a.w < b.w ? a : b;
}

int groundType(vec2 col) {
  return rand(col * 2.13) < dirtRatio ? 1 : 2;
}

float groundHeight(vec2 col) {
  float h = floor(rand(col) * max(1.0, terrainHeight));
  if (spectrumHeight > 0.001) {
    float bin = 0.03 + 0.72 * rand(col + vec2(19.3, 7.1));
    float fft = IMG_NORM_PIXEL(audioFFT, vec2(bin, 0.5)).r;
    h += fft * spectrumHeight;
  }
  return h;
}

vec4 dGroundColumn(vec3 pos, vec2 col) {
  col = floor(col);
  float height = groundHeight(col);
  float dist = pos.z - height;
  float blockZ = dist < 0.0 ? height - ceil(height - pos.z) : height - 1.0;
  dist = max(dist, pos.x - col.x - 1.0);
  dist = max(dist, -pos.x + col.x);
  dist = max(dist, pos.y - col.y - 1.0);
  dist = max(dist, -pos.y + col.y);
  return vec4(col, blockZ, dist);
}

vec4 dGround(vec3 pos) {
  vec4 dist = dGroundColumn(pos, pos.xy);
  vec3 du = vec3(floor(fract(pos.xy) * 2.0) * 2.0 - 1.0, 0.0);
  dist = u(dist, dGroundColumn(pos, pos.xy + du.xz));
  dist = u(dist, dGroundColumn(pos, pos.xy + du.zy));
  dist = u(dist, dGroundColumn(pos, pos.xy + du.xy));
  return dist;
}

vec4 d(vec3 pos) {
  vec4 dist = dGround(pos);
  if (craterRadius > 0.001) {
    float dist2 = craterRadius - length(pos);
    if (dist2 > dist.w) {
      dist = vec4(floor(pos), dist2);
    }
  }
  return dist;
}

vec3 getNormal(vec3 p) {
  const float dx = 0.001;
  vec3 g = vec3(
    d(p + vec3(dx, 0.0, 0.0)).w - d(p + vec3(-dx, 0.0, 0.0)).w,
    d(p + vec3(0.0, dx, 0.0)).w - d(p + vec3(0.0, -dx, 0.0)).w,
    d(p + vec3(0.0, 0.0, dx)).w - d(p + vec3(0.0, 0.0, -dx)).w
  );
  float len = length(g);
  return len > 1e-5 ? g / len : vec3(0.0, 0.0, 1.0);
}

void main() {
  vec2 pos = isf_FragNormCoord - 0.5;
  pos.x *= RENDERSIZE.x / max(RENDERSIZE.y, 1.0);

  float flyT = TIME * speed;
  vec3 camPos = vec3(0.0, -20.0, camHeight + beatBounce) + vec3(flyT * 2.25, flyT * 3.0, 0.0);

  float yaw = -TIME * turnSpeed;
  vec3 camDir = normalize(vec3(cos(yaw), sin(yaw), pitch));
  vec3 camSide = normalize(cross(camDir, vec3(0.0, 0.0, 1.0)));
  vec3 camUp = cross(camSide, camDir);

  vec3 rayDir = normalize(camSide * pos.x + camUp * pos.y + camDir * max(focus, 0.1));

  float maxDist = max(fogDistance, 10.0);
  float maxTerrainZ = max(1.0, terrainHeight) + max(0.0, spectrumHeight);

  float t = 0.0;
  vec4 dist = vec4(0.0, 0.0, 0.0, maxDist);
  vec3 posOnRay = camPos;
  bool hit = false;

  for (int i = 0; i < 164; ++i) {
    if (t > maxDist) break;
    if (posOnRay.z > maxTerrainZ + 0.25 && rayDir.z >= 0.0) {
      t = maxDist + 1.0;
      break;
    }
    dist = d(posOnRay);
    if (abs(dist.w) < 0.002) {
      hit = true;
      break;
    }
    float stepSize = dist.w;
    if (stepSize > 0.0) {
      if (posOnRay.z <= maxTerrainZ + 1.0) {
        // Never skip beyond the 2x2 neighbor neighborhood (half-cell = 0.5).
        stepSize = min(stepSize, 0.48);
      } else if (rayDir.z < -1e-4) {
        float toCeiling = (posOnRay.z - maxTerrainZ) / (-rayDir.z);
        stepSize = min(stepSize, max(toCeiling, 0.48));
      }
    }
    t += stepSize;
    posOnRay = camPos + t * rayDir;
  }

  if (!hit && t < maxDist && abs(dist.w) < 0.1) {
    hit = true;
  }

  vec3 skyCol = sky(rayDir);
  vec3 color;
  if (hit) {
    vec3 normal = getNormal(posOnRay);
    vec3 localPos = clamp(posOnRay - dist.xyz, 0.0, 0.999);
    float diff = clamp(dot(LIGHT_DIR, normal), ambient, 1.0);
    int block = groundType(dist.xy);
    // Blocks beneath a grass column's top block are dirt.
    if (block == 2 && posOnRay.z < groundHeight(dist.xy) - 1.005) {
      block = 1;
    }
    color = blockColor(localPos, block) * diff;
    float fog = smoothstep(maxDist * 0.45, maxDist, t);
    color = mix(color, skyCol, fog);
  } else {
    color = skyCol;
  }

  gl_FragColor = vec4(color, 1.0);
}
