/*{
  "DESCRIPTION": "Minimalist neobrutalist Demo Night card over a clean 40px graph-paper canvas: two-tone mint header and pale-mint body, crisp black border, hard offset drop shadow that presses in on beats, header band meters, and a flat ink waveform.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Graphic", "Audio"],
  "INPUTS": [
    { "NAME": "audio", "TYPE": "audio" },
    { "NAME": "paperBackground", "TYPE": "bool", "GROUP": "Graph Paper", "LABEL": "Graph paper bg", "DESCRIPTION": "Draw the white 40px engineering graph-paper background (turn off for transparent card overlay)", "DEFAULT": true },
    { "NAME": "gridSize", "TYPE": "float", "GROUP": "Graph Paper", "LABEL": "Grid size (px)", "DESCRIPTION": "Square graph-paper cell spacing in pixels", "DEFAULT": 40, "MIN": 16, "MAX": 120 },
    { "NAME": "gridOpacity", "TYPE": "float", "GROUP": "Graph Paper", "LABEL": "Grid opacity", "DESCRIPTION": "Subtlety of the 1px graph-paper lines", "DEFAULT": 0.16, "MIN": 0, "MAX": 0.6 },
    { "NAME": "gridScroll", "TYPE": "float", "GROUP": "Graph Paper", "LABEL": "Grid drift", "DESCRIPTION": "Gentle diagonal graph-paper drift in cells per second (0 = still)", "DEFAULT": 0.04, "MIN": 0, "MAX": 1 },
    { "NAME": "width", "TYPE": "float", "GROUP": "Card", "LABEL": "Width", "DESCRIPTION": "Card width as a fraction of the viewport", "DEFAULT": 0.78, "MIN": 0.2, "MAX": 0.96 },
    { "NAME": "height", "TYPE": "float", "GROUP": "Card", "LABEL": "Height", "DESCRIPTION": "Card height as a fraction of the viewport", "DEFAULT": 0.56, "MIN": 0.15, "MAX": 0.92 },
    { "NAME": "headerRatio", "TYPE": "float", "GROUP": "Card", "LABEL": "Header height", "DESCRIPTION": "Top accent header strip as a fraction of card height (0 = single-tone card)", "DEFAULT": 0.18, "MIN": 0, "MAX": 0.45 },
    { "NAME": "radius", "TYPE": "float", "GROUP": "Card", "LABEL": "Corner radius (px)", "DESCRIPTION": "Subtle corner rounding in pixels", "DEFAULT": 6, "MIN": 0, "MAX": 32 },
    { "NAME": "borderWidth", "TYPE": "float", "GROUP": "Card", "LABEL": "Border (px)", "DESCRIPTION": "Hard outline thickness in pixels", "DEFAULT": 2.5, "MIN": 0, "MAX": 10 },
    { "NAME": "shadowX", "TYPE": "float", "GROUP": "Shadow & Motion", "LABEL": "Shadow X (px)", "DESCRIPTION": "Horizontal hard drop-shadow offset in pixels", "DEFAULT": 5, "MIN": -24, "MAX": 24 },
    { "NAME": "shadowY", "TYPE": "float", "GROUP": "Shadow & Motion", "LABEL": "Shadow Y (px)", "DESCRIPTION": "Vertical downward hard drop-shadow offset in pixels", "DEFAULT": 8, "MIN": -24, "MAX": 24 },
    { "NAME": "beatPress", "TYPE": "float", "GROUP": "Shadow & Motion", "LABEL": "Beat press", "DESCRIPTION": "How far the card presses down into its shadow on beats", "DEFAULT": 0.45, "MIN": 0, "MAX": 1 },
    { "NAME": "audioWave", "TYPE": "float", "GROUP": "Audio", "LABEL": "Ink waveform", "DESCRIPTION": "Clean flat ink waveform along the lower strip of the card (0 = off)", "DEFAULT": 0.75, "MIN": 0, "MAX": 1 },
    { "NAME": "statusBoxes", "TYPE": "bool", "GROUP": "Audio", "LABEL": "Header meters", "DESCRIPTION": "Show minimalist neobrutalist band squares and level bar in the header", "DEFAULT": true },
    { "NAME": "paperColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Paper canvas", "DESCRIPTION": "Background canvas colour behind the graph-paper lines", "DEFAULT": [1, 1, 1, 1] },
    { "NAME": "gridColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Grid lines", "DESCRIPTION": "Graph-paper line colour", "DEFAULT": [0.5, 0.5, 0.5, 1] },
    { "NAME": "headerColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Header mint", "DESCRIPTION": "Primary vibrant accent fill for the header strip", "DEFAULT": [0.02, 0.88, 0.48, 1] },
    { "NAME": "bodyColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Body surface", "DESCRIPTION": "Pale surface fill for the card body", "DEFAULT": [0.871, 0.988, 0.914, 1] },
    { "NAME": "borderColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Ink / border", "DESCRIPTION": "Border, drop-shadow, and flat ink colour", "DEFAULT": [0, 0, 0, 1] }
  ]
}*/

float roundedBoxSdf(vec2 p, vec2 halfSize, float r) {
  float rad = min(r, min(halfSize.x, halfSize.y));
  vec2 q = abs(p) - (halfSize - vec2(rad));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}

float boxSdf(vec2 p, vec2 bMin, vec2 bMax) {
  vec2 c = 0.5 * (bMin + bMax);
  vec2 e = 0.5 * (bMax - bMin);
  vec2 q = abs(p - c) - e;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float sampleWave(float u) {
  return IMG_NORM_PIXEL(audio, vec2(clamp(u, 0.004, 0.996), 0.5)).r - 0.5;
}

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-5), 0.0, 1.0);
  return length(p - a - ab * h);
}

void main() {
  vec2 px = (isf_FragNormCoord - 0.5) * RENDERSIZE;

  // Clean 40px graph-paper background matching the Demo Night webpage (#ffffff + #80808020/#80808030).
  vec3 bgCol = paperColor.rgb;
  if (paperBackground) {
    float sz = max(12.0, gridSize);
    vec2 gCoord = px / sz + vec2(TIME * gridScroll, TIME * gridScroll * 0.6);
    vec2 f = fract(gCoord);
    vec2 dLine = min(f, 1.0 - f) * sz;
    float vLine = 1.0 - smoothstep(0.25, 0.9, dLine.x);
    float hLine = 1.0 - smoothstep(0.25, 0.9, dLine.y);
    // Horizontal lines are slightly darker than vertical lines, matching #80808030 vs #80808020.
    float lineAlpha = max(vLine * gridOpacity * 0.8, hLine * gridOpacity * 1.15);
    bgCol = mix(bgCol, gridColor.rgb, clamp(lineAlpha, 0.0, 1.0));
  }

  vec2 halfSize = vec2(width, height) * RENDERSIZE * 0.5;
  halfSize.x = min(halfSize.x, RENDERSIZE.y * 0.78);

  // Tactile neobrutalist press-in toward the shadow on detected beats.
  float press = AUDIO_BEAT * beatPress * 0.65;
  vec2 shadowOff = vec2(shadowX, -shadowY);
  vec2 cardCenter = shadowOff * press;

  vec2 pCard = px - cardCenter;
  vec2 pShadow = px - shadowOff;

  float dCard = roundedBoxSdf(pCard, halfSize, radius);
  float dShadow = roundedBoxSdf(pShadow, halfSize, radius);

  float shadowMask = 1.0 - smoothstep(-0.6, 0.6, dShadow);
  float cardMask = 1.0 - smoothstep(-0.6, 0.6, dCard);
  float innerMask = 1.0 - smoothstep(-0.6, 0.6, dCard + borderWidth);

  float fgAlpha = max(shadowMask, cardMask);
  if (fgAlpha < 0.001) {
    gl_FragColor = paperBackground ? vec4(bgCol, 1.0) : vec4(0.0);
    return;
  }

  vec3 fgCol = borderColor.rgb;

  if (innerMask > 0.001) {
    float cardH = halfSize.y * 2.0;
    float cardW = halfSize.x * 2.0;
    float dividerY = halfSize.y - cardH * headerRatio;
    bool hasHeader = headerRatio > 0.01;

    float inHeader = hasHeader ? smoothstep(dividerY - 0.5, dividerY + 0.5, pCard.y) : 0.0;
    vec3 fill = mix(bodyColor.rgb, headerColor.rgb, inHeader);

    if (hasHeader && borderWidth > 0.1) {
      float divLine = 1.0 - smoothstep(borderWidth * 0.5 - 0.5, borderWidth * 0.5 + 0.5, abs(pCard.y - dividerY));
      fill = mix(fill, borderColor.rgb, divLine);
    }

    // Three minimalist neobrutalist square band meters (bass / mid / high) + level pill.
    if (hasHeader && statusBoxes) {
      float hdrH = cardH * headerRatio;
      float sq = clamp(hdrH * 0.36, 12.0, 22.0);
      float gap = sq * 0.55;
      float padL = max(18.0, hdrH * 0.32);
      float cy = dividerY + hdrH * 0.5;
      float bw = clamp(borderWidth * 0.8, 1.5, 2.5);

      float levels[3];
      levels[0] = AUDIO_BASS;
      levels[1] = AUDIO_MID;
      levels[2] = AUDIO_HIGH;

      for (int i = 0; i < 3; i++) {
        float x0 = -halfSize.x + padL + float(i) * (sq + gap);
        vec2 bMin = vec2(x0, cy - sq * 0.5);
        vec2 bMax = vec2(x0 + sq, cy + sq * 0.5);
        float dSq = boxSdf(pCard, bMin, bMax);
        float sqOut = 1.0 - smoothstep(-0.5, 0.5, dSq);
        float sqIn = 1.0 - smoothstep(-0.5, 0.5, dSq + bw);
        float dSqSh = boxSdf(pCard, bMin + vec2(2.0, -2.5), bMax + vec2(2.0, -2.5));
        float sqSh = 1.0 - smoothstep(-0.5, 0.5, dSqSh);
        // Bottom-up crisp ink level fill inside the pale-mint square.
        float lvlY = mix(bMin.y + bw, bMax.y - bw, clamp(levels[i] * 0.88, 0.0, 1.0));
        float barFill = sqIn * (1.0 - smoothstep(lvlY - 0.5, lvlY + 0.5, pCard.y));
        fill = mix(fill, borderColor.rgb, sqSh * 0.9);
        fill = mix(fill, borderColor.rgb, sqOut);
        fill = mix(fill, bodyColor.rgb, sqIn);
        fill = mix(fill, borderColor.rgb, barFill);
      }

      float barW = clamp(cardW * 0.14, 48.0, 110.0);
      float barH = sq * 0.55;
      vec2 mMin = vec2(halfSize.x - padL - barW, cy - barH * 0.5);
      vec2 mMax = vec2(halfSize.x - padL, cy + barH * 0.5);
      float dM = boxSdf(pCard, mMin, mMax);
      float mOut = 1.0 - smoothstep(-0.5, 0.5, dM);
      float mIn = 1.0 - smoothstep(-0.5, 0.5, dM + bw);
      float dMSh = boxSdf(pCard, mMin + vec2(2.0, -2.5), mMax + vec2(2.0, -2.5));
      float mSh = 1.0 - smoothstep(-0.5, 0.5, dMSh);
      float fillX = mix(mMin.x + bw, mMax.x - bw, clamp(AUDIO_LEVEL * 0.92, 0.0, 1.0));
      float meterFill = mIn * (1.0 - smoothstep(fillX - 0.5, fillX + 0.5, pCard.x));
      fill = mix(fill, borderColor.rgb, mSh * 0.9);
      fill = mix(fill, borderColor.rgb, mOut);
      fill = mix(fill, bodyColor.rgb, mIn);
      fill = mix(fill, borderColor.rgb, meterFill);
    }

    // Minimalist flat ink waveform along the lower margin of the card body.
    if (audioWave > 0.01) {
      float bodyTop = hasHeader ? dividerY - borderWidth : halfSize.y - borderWidth;
      float bodyBot = -halfSize.y + borderWidth;
      float bodyH = max(1.0, bodyTop - bodyBot);
      float marginX = max(24.0, cardW * 0.06);
      float waveW = max(1.0, cardW - marginX * 2.0);
      float waveY = bodyBot + bodyH * 0.16;
      float waveAmp = bodyH * 0.15 * audioWave;

      if (pCard.x >= -halfSize.x + marginX - 4.0 && pCard.x <= halfSize.x - marginX + 4.0 &&
          abs(pCard.y - waveY) < bodyH * 0.22) {
        float u = clamp((pCard.x - (-halfSize.x + marginX)) / waveW, 0.0, 1.0);
        float baseLine = 1.0 - smoothstep(0.4, 1.1, abs(pCard.y - waveY));
        fill = mix(fill, borderColor.rgb, baseLine * 0.14 * audioWave);

        float win = 0.5;
        float samples = win * 254.0;
        float centerS = u * samples;
        float baseS = floor(centerS);
        float minD = 1e5;
        for (int k = -2; k <= 2; k++) {
          float sA = clamp((baseS + float(k)) / samples, 0.0, 1.0);
          float sB = clamp((baseS + float(k + 1)) / samples, 0.0, 1.0);
          vec2 a = vec2(-halfSize.x + marginX + sA * waveW, waveY + sampleWave(sA * win) * waveAmp * 2.0);
          vec2 b = vec2(-halfSize.x + marginX + sB * waveW, waveY + sampleWave(sB * win) * waveAmp * 2.0);
          minD = min(minD, segDist(pCard, a, b));
        }
        float inkLine = 1.0 - smoothstep(0.9, 1.8, minD);
        fill = mix(fill, borderColor.rgb, inkLine * audioWave);
      }
    }

    fgCol = mix(fgCol, fill, innerMask);
  }

  if (paperBackground) {
    gl_FragColor = vec4(mix(bgCol, fgCol, fgAlpha), 1.0);
  } else {
    gl_FragColor = vec4(fgCol, fgAlpha);
  }
}
