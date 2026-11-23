/*{
  "DESCRIPTION": "Audio-reactive procedural Wolfenstein 3D dungeon raycaster with grey bricks, blue stone, wood panelling, sliding metal doors, banners, and hanging lamps. Walk speed surges smoothly with bass and beats, walls light up with a pixel-aligned FFT spectrum, hanging lamps flare and cast pulsing halos, doors jolt on kicks, and the camera bobs and punches FOV to the rhythm. Ported from 'Wolfenstein' by Reinder Nijhoff (CC BY-NC-SA 4.0).",
  "CREDIT": "Reinder Nijhoff 2013 (@reindernijhoff, CC BY-NC-SA 4.0, shadertoy.com/view/4sfGWX), ported & made audio-reactive for Gumpkestra",
  "CATEGORIES": ["Generator", "3D", "Retro", "Audio"],
  "INPUTS": [
    { "NAME": "audioFFT", "TYPE": "audioFFT" },
    { "NAME": "speed", "TYPE": "float", "GROUP": "Camera", "LABEL": "Walk speed", "DESCRIPTION": "Base forward walking speed through the dungeon (0 = move only on audio surge)", "DEFAULT": 1.0, "MIN": -3.0, "MAX": 3.0 },
    { "NAME": "fov", "TYPE": "float", "GROUP": "Camera", "LABEL": "Focal length", "DESCRIPTION": "Camera lens focal length (2.5 = original Wolfenstein shader)", "DEFAULT": 2.5, "MIN": 1.0, "MAX": 4.5 },
    { "NAME": "lookSway", "TYPE": "float", "GROUP": "Camera", "LABEL": "Look sway", "DESCRIPTION": "Horizontal head-looking sway while moving down corridors", "DEFAULT": 0.3, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "headBob", "TYPE": "float", "GROUP": "Camera", "LABEL": "Head bob", "DESCRIPTION": "FPS walking head bob, beat stomp dip, and subtle beat roll tilt", "DEFAULT": 0.35, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audioResponse", "TYPE": "float", "GROUP": "Audio", "LABEL": "Audio response", "DESCRIPTION": "Master multiplier for all audio-reactive effects (0 = classic static Wolfenstein)", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 2.0 },
    { "NAME": "audioSpeed", "TYPE": "float", "GROUP": "Audio", "LABEL": "Speed surge", "DESCRIPTION": "Bass and beats smoothly accelerate walking speed forward without stepping back", "DEFAULT": 1.2, "MIN": 0.0, "MAX": 4.0 },
    { "NAME": "fovPulse", "TYPE": "float", "GROUP": "Audio", "LABEL": "FOV beat punch", "DESCRIPTION": "Widen camera FOV rhythmically on bass and detected kicks", "DEFAULT": 0.35, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "wallSpectrum", "TYPE": "float", "GROUP": "Audio", "LABEL": "Wall FFT glow", "DESCRIPTION": "64x64 pixel-aligned live audio spectrum bars glowing across dungeon walls and doors", "DEFAULT": 0.75, "MIN": 0.0, "MAX": 2.0 },
    { "NAME": "lampPulse", "TYPE": "float", "GROUP": "Audio", "LABEL": "Lamp strobe", "DESCRIPTION": "Hanging green lamps flare, emit volumetric halos, and cast floor/ceiling pools on highs and beats", "DEFAULT": 0.9, "MIN": 0.0, "MAX": 2.0 },
    { "NAME": "beatFlash", "TYPE": "float", "GROUP": "Audio", "LABEL": "Corridor flash", "DESCRIPTION": "Rhythmic torchlight illumination pulse down corridors on beats and bass", "DEFAULT": 0.55, "MIN": 0.0, "MAX": 2.0 },
    { "NAME": "doorReact", "TYPE": "float", "GROUP": "Audio", "LABEL": "Door kick jolt", "DESCRIPTION": "Sliding metal doors shudder and part slightly wider on kicks and bass", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.5 },
    { "NAME": "audioHue", "TYPE": "float", "GROUP": "Audio", "LABEL": "Audio hue shift", "DESCRIPTION": "Rotate the dungeon palette subtly with mid frequencies and beats", "DEFAULT": 0.12, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "fogAmount", "TYPE": "float", "GROUP": "Look", "LABEL": "Corridor shadow", "DESCRIPTION": "Distance shadow falloff down hallways (pulls back on beat flashes; 0 = flat original lighting)", "DEFAULT": 0.2, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "pixelate", "TYPE": "float", "GROUP": "Look", "LABEL": "Retro pixelate", "DESCRIPTION": "Snap screen resolution down toward chunky 1992 DOS VGA pixels (0 = native resolution)", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "ditherDepth", "TYPE": "float", "GROUP": "Look", "LABEL": "Colour steps", "DESCRIPTION": "Per-channel palette quantization for 8-bit dithering (32 = original)", "DEFAULT": 32.0, "MIN": 4.0, "MAX": 64.0 },
    { "NAME": "hueShift", "TYPE": "float", "GROUP": "Look", "LABEL": "Hue shift", "DESCRIPTION": "Manual colour palette rotation", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "brightness", "TYPE": "float", "GROUP": "Look", "LABEL": "Brightness", "DESCRIPTION": "Overall output brightness (values above 1 push lamp flares into HDR)", "DEFAULT": 1.0, "MIN": 0.2, "MAX": 2.5 }
  ],
  "PASSES": [
    { "TARGET": "walkState", "PERSISTENT": true, "FLOAT": true, "WIDTH": 1, "HEIGHT": 1 },
    {}
  ]
}*/

// Wolfenstein. Created by Reinder Nijhoff 2013
// Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License.
// @reindernijhoff
//
// https://www.shadertoy.com/view/4sfGWX
//

#define NUM_MATERIALS 3
#define NUM_OBJECTS 1
#define SECONDS_IN_ROOM 3.
#define ROOM_SIZE 10.
#define MAXSTEPS 17
#define MATERIAL_DOOR 200
#define MATERIAL_DOORWAY 201

#define COL(r,g,b) vec3(r/255.,g/255.,b/255.)

vec3 rdcenter;

//----------------------------------------------------------------------
// Math functions

float hash( const float n ) {
    return fract(sin(n*14.1234512)*51231.545341231);
}
float hash( const vec2 x ) {
	float n = dot( x, vec2(14.1432,1131.15532) );
    return fract(sin(n)*51231.545341231);
}
float crossp( const vec2 a, const vec2 b ) { return a.x*b.y - a.y*b.x; }
vec3 rotate(vec3 r, float v){ return vec3(r.x*cos(v)+r.z*sin(v),r.y,r.z*cos(v)-r.x*sin(v));}
vec3 rotateHue(vec3 col, float turns) {
	float a = turns * 6.2831853;
	float c = cos(a), s = sin(a);
	vec3 k = vec3(0.57735027);
	return col * c + cross(k, col) * s + k * dot(k, col) * (1.0 - c);
}
bool intersectSegment(const vec3 ro, const vec3 rd, const vec2 a, const vec2 b, out float dist, out float u) {
	vec2 p = ro.xz;	vec2 r = rd.xz;
	vec2 q = a-p;	vec2 s = b-a;
	float rCrossS = crossp(r, s);
	
	if( rCrossS == 0.){
		return false;
    } else {
		dist = crossp(q, s) / rCrossS;
		u = crossp(q, r) / rCrossS;
	
		if(0. <= dist && 0. <= u && u <= 1.){
			return true;
        } else {
			return false;
        }
    }
}

//----------------------------------------------------------------------
// Material helper functions

float onCircle( const vec2 c, const vec2 centre, const float radius ) {
	return clamp( 4.*(radius - distance(c,centre)), 0., 1. );
}
float onCircleLine( const vec2 c, const vec2 centre, const float radius ) {
	return clamp( 1.-1.5*abs(radius - distance(c,centre)), 0., 1. );
}
float onLine( const float c, const float b ) {
	return clamp( 1.-abs(b-c), 0., 1. );
}
float onBand( const float c, const float mi, const float ma ) {
	return clamp( (ma-c+1.), 0., 1. )*clamp( (c-mi+1.), 0., 1. );
}
float onLineSegmentX( const vec2 c, const float b, const float mi, const float ma ) {
	return onLine( c.x, b )*onBand( c.y, mi, ma );
}
float onLineSegmentY( const vec2 c, const float b, const float mi, const float ma ) {
	return onLine( c.y, b )*onBand( c.x, mi, ma );
}
float onRect( const vec2 c, const vec2 lt, const vec2 rb ) {
	return onBand( c.x, lt.x, rb.x )*onBand( c.y, lt.y, rb.y );
}
vec3 addBevel( const vec2 c, const vec2 lt, const vec2 rb, const float size, const float strength, const float lil, const float lit, const vec3 col ) {
	float xl = clamp( (c.x-lt.x)/size, 0., 1. ); 
	float xr = clamp( (rb.x-c.x)/size, 0., 1. );	
	float yt = clamp( (c.y-lt.y)/size, 0., 1. ); 
	float yb = clamp( (rb.y-c.y)/size, 0., 1. );	

	return mix( col, col*clamp(1.0+strength*(lil*(xl-xr)+lit*(yb-yt)), 0., 2.), onRect( c, lt, rb ) );
}
vec3 addKnob( const vec2 c, const vec2 centre, const float radius, const float strength, const vec3 col ) {
	vec2 diff = centre - c;
	float len = length(diff);
	vec2 lv = len > 1e-5 ? diff / len : vec2(0.0);
	return mix( col, col*(1.0+strength*dot(lv,vec2(-0.7071,0.7071))), onCircle(c, centre, radius ) );
}
float stepeq( float a, float b ) { 
	return step( a, b )*step( b, a );
}

//----------------------------------------------------------------------
// Generate materials!

void getMaterialColor( const int material, in vec2 uv, const float decorationHash, out vec3 col ) {	
	vec3 fgcol;
	
	uv = floor( mod(uv+64., vec2(64.)) );
	vec2 uvs = uv / 64.;
	
	// basecolor
	vec3 basecol = vec3( mix(55./255.,84./255.,uvs.y ) );	
	float br = hash(uv);
	col = basecol;
	float mortarMask = 0.0;
// grey bricks
	if( material == 0 || material == 1 ) {
		vec2 buv = vec2( mod(uv.x+1. + (floor((uv.y+1.) / 16.) * 16.), 32.) , mod( uv.y+1., 16.) );
		float bbr = mix( 190./255., 91./255., (buv.y)/14. ) + 0.05*br;
		if ( buv.x < 2. || buv.y < 2.) {
			bbr = 72./255.; 
			mortarMask = 1.0;
		}
		col = vec3(bbr*0.95);
		col = addBevel( buv, vec2(1.,1.), vec2( 31.5, 15.), 2., 0.35, 1., 1., col);
	// blue wall
		if( material == 1 ) {
			col *= 1.3*COL(11.,50.,209.);
			col = mix( col, COL(2.,15.,86.), onBand(uv.y,14.,49.));
			col = mix( col, COL(9.,44.,185.)*(0.9+0.1*br), onBand(uv.y,16.,47.));
			col = mix( col, COL(3.,25.,122.), onBand(uv.y,21.,42.));
			col = addBevel( uv, vec2(-1.,16.), vec2( 65., 21.), 1., 0.35, 1., 1., col);
			col = addBevel( uv, vec2(-1.,43.), vec2( 65., 48.), 1., 0.35, 1., 1., col);
			
			col = mix( col, COL(2.,11.,74.), onRect(uv, vec2(22.,22.), vec2(42.,42.)));		
			col = mix( col, COL(9.,44.,185.)*(0.95+0.1*br), onRect(uv, vec2(22.,23.), vec2(42.,40.)));
			col = addBevel( uv, vec2(22.,23.), vec2(42.,40.), 1., 0.2, -1., 1., col);
			col = mix( col, COL(2.,11.,74.), onRect(uv, vec2(26.,26.), vec2(38.,37.)));
			col = mix( col, COL(9.,44.,185.)*(0.92+0.1*br), onRect(uv, vec2(28.,28.), vec2(36.,35.)));
			col = addBevel( uv, vec2(28.,28.), vec2(36.,35.), 1., 0.35, 1., 1., col);
		}
	}
// wooden wall
	else if( material == 2 ) {
		float mx = mod( uv.x, 64./5. ); 
		float h1 = hash( floor(uv.x/(64./5.)) );
		float h2 = hash( 1.+1431.16*floor(uv.x/(64./5.)) );
		col = mix( COL(115.,75.,43.),COL( 71.,56.,26.), smoothstep( 0.2, 1., (0.7+h2)*abs(mod( h2-uv.y*(0.05+0.1*h2)+(1.+h1+h2)*sin(mx*(0.1+0.2*h2)), 2. )-1.) ) );

		col = mix( col, mix(COL(40.,31.,13.), COL(142.,91.,56.), (uv.x)/2.), step(uv.x,2.) );
		col = mix( col, mix(COL(40.,31.,13.), COL(142.,91.,56.), (uv.x-10.)/2.), step(10.,uv.x)*step(uv.x,12.) );
		col = mix( col, mix(COL(40.,31.,13.), COL(142.,91.,56.), (uv.x-26.)/2.), step(26.,uv.x)*step(uv.x,28.) );
		col = mix( col, mix(COL(40.,31.,13.), COL(142.,91.,56.), (uv.x-40.)/2.), step(40.,uv.x)*step(uv.x,42.) );
		col = mix( col, mix(COL(40.,31.,13.), COL(142.,91.,56.), (uv.x-54.)/2.), step(54.,uv.x)*step(uv.x,56.) );

		col = mix( col, mix(COL(83.,60.,31.), COL(142.,91.,56.), (uv.x- 8.)), step( 8.,uv.x)*step(uv.x,9.) );
		col = mix( col, mix(COL(83.,60.,31.), COL(142.,91.,56.), (uv.x-24.)), step(24.,uv.x)*step(uv.x,25.) );
		col = mix( col, mix(COL(83.,60.,31.), COL(142.,91.,56.), (uv.x-38.)), step(38.,uv.x)*step(uv.x,39.) );
		col = mix( col, mix(COL(83.,60.,31.), COL(142.,91.,56.), (uv.x-52.)), step(52.,uv.x)*step(uv.x,53.) );
		col = mix( col, mix(COL(83.,60.,31.), COL(142.,91.,56.), (uv.x-62.)), step(62.,uv.x) );
		
		col = mix( col, mix(COL(40.,31.,13.), COL(142.,91.,56.), (uv.y)/2.), step(uv.y,2.) );
		col *= 1.-0.3*stepeq(uv.y,3.);
	}
// door
	else if( material == MATERIAL_DOOR ) {
		fgcol = COL(44., 176., 175.)*(0.95+0.15*sin(-0.25+ 4.*((-0.9-uvs.y)/(1.3-0.8*uvs.x)) ) );
		fgcol = addBevel( uv, vec2(-1.,1.), vec2(62.,66.), 2., 0.4, -1., -1., fgcol);
		fgcol = addBevel( uv, vec2( 6.,6.), vec2(57.,57.), 2.25, 0.5, -1., -1., fgcol);	
		fgcol = mix( addKnob( mod( uv, vec2(8.) ), vec2(3.5), 1.65, 0.5, fgcol ), fgcol, onRect( uv,  vec2( 6.,6.), vec2(57.,57.)) ) ;
		
		//knob
		fgcol *= 1.-0.2*onRect( uv, vec2( 13.5, 28.5 ), vec2( 22.5, 44.5 ) );
		fgcol = mix( fgcol, mix( COL(44.,44.,44.),COL(152.,152.,152.), ((uv.x+(43.-uv.y)-15.)/25. ) ), onRect( uv, vec2( 15., 27. ), vec2( 24., 43. ) ) );
		fgcol = addBevel( uv, vec2( 15., 27. ), vec2( 24., 43. ), 1., 0.45, 1., 1., fgcol);	
		fgcol = mix( fgcol, addKnob( mod( uv, vec2(6.) ), vec2(4.25,5.5), 1.15, 0.75, fgcol ), onRect( uv,  vec2( 15., 27. ), vec2( 24., 43. ) ) ) ;

		fgcol *= 1.-0.5*onRect( uv, vec2( 16.5, 33.5 ), vec2( 20.5, 38.5 ) );
		fgcol = mix( fgcol, mix( COL(88.,84.,11.),COL(251.,242.,53.), ((uv.x+(37.-uv.y)-18.)/7. ) ), onRect( uv, vec2( 18., 33. ), vec2( 21., 37. ) ) );
		fgcol = mix( fgcol, COL(0.,0.,0.), onRect( uv, vec2( 19., 34. ), vec2( 20., 35.7 ) ) );

		fgcol *= 1.-0.2*onRect( uv, vec2( 6.5, 29.5 ), vec2( 10.5, 41.5 ) );
		fgcol = mix( fgcol, mix( COL(88.,84.,11.),COL(251.,242.,53.), ((uv.x+(40.-uv.y)-9.)/13. ) ), onRect( uv, vec2( 9., 29. ), vec2( 11., 40. ) ) );
		fgcol = addBevel( uv, vec2( 9., 29. ), vec2( 11., 40. ), 0.75, 0.5, 1., 1., fgcol);	
		
		col = mix( basecol, fgcol, onRect( uv, vec2(1.,1.), vec2(62.,62.) ) );	
	}
// doorway
	else if( material == MATERIAL_DOORWAY ) {
		fgcol = COL(44., 176., 175.)*(0.95+0.15*sin(-0.25+ 4.*((-0.9-uvs.y)/(1.3-0.8*uvs.x)) ) );
		vec2 uvhx = vec2( 32.-abs(uv.x-32.), uv.y );
		fgcol = addBevel( uvhx, vec2(-1.,1.), vec2(28.,66.), 2., 0.4, -1., -1., fgcol);
		fgcol = addBevel( uvhx, vec2( 6.,6.), vec2(23.,57.), 2.25, 0.5, -1., -1., fgcol);	
		fgcol = mix( addKnob( vec2( mod( uvhx.x, 22. ), mod( uvhx.y, 28. )), vec2(3.5), 1.65, 0.5, fgcol ), fgcol, onRect( uvhx,  vec2( 6.,6.), vec2(24.,57.)) ) ;
		fgcol = mix( fgcol, vec3(0.), onRect( uv, vec2( 29., 1.), vec2( 35., 63.) ) );
		col = mix( basecol, fgcol, onRect( uv, vec2(1.,1.), vec2(62.,62.) ) );	
	}
	
// prison door	
	if( decorationHash > 0.93 && material < (NUM_MATERIALS+1) ) {	
		vec4 prisoncoords = vec4(12.,14.,52.,62.);
	// shadow
		col *= 1.-0.5*onRect( uv,  vec2( 11., 13. ), vec2( 53., 63. ) );
	// hinge
		col = mix( col, COL(72.,72.,72.), stepeq(uv.x, 53.)*step( mod(uv.y+2.,25.), 5.)*step(13.,uv.y) );
		col = mix( col, COL(100.,100.,100.), stepeq(uv.x, 53.)*step( mod(uv.y+1.,25.), 3.)*step(13.,uv.y) );
		
		vec3 pcol = vec3(0.)+COL(100.,100.,100.)*step( mod(uv.x-4., 7.), 0. ); 
		pcol += COL(55.,55.,55.)*step( mod(uv.x-5., 7.), 0. ); 
		pcol = addBevel(uv, vec2(0.,17.), vec2(63.,70.), 3., 0.8, 0., -1., pcol);
		pcol = addBevel(uv, vec2(0.,45.), vec2(22.,70.), 3., 0.8, 0., -1., pcol);
		
		fgcol = COL(72.,72.,72.);
		fgcol = addBevel(uv, prisoncoords.xy, prisoncoords.zw+vec2(1.,1.), 1., 0.5, -1., 1., fgcol );
		fgcol = addBevel(uv, prisoncoords.xy+vec2(3.,3.), prisoncoords.zw-vec2(2.,1.), 1., 0.5, 1., -1., fgcol );
		fgcol = mix( fgcol, pcol, onRect( uv, prisoncoords.xy+vec2(3.,3.), prisoncoords.zw-vec2(3.,2.) ) );
		fgcol = mix( fgcol, COL(72.,72.,72.), onRect( uv, vec2(15.,32.5), vec2(21.,44.) ) );
		
		fgcol = mix( fgcol, mix( COL(0.,0.,0.), COL(43.,43.,43.), (uv.y-37.) ), stepeq(uv.x, 15.)*step(37.,uv.y)*step(uv.y,38.) );
		fgcol = mix( fgcol, mix( COL(0.,0.,0.), COL(43.,43.,43.), (uv.y-37.)/3. ), stepeq(uv.x, 17.)*step(37.,uv.y)*step(uv.y,40.) );
		fgcol = mix( fgcol, COL(43.,43.,43.), stepeq(uv.x, 18.)*step(37.,uv.y)*step(uv.y,41.) );
		fgcol = mix( fgcol, mix( COL(0.,0.,0.), COL(100.,100.,100.), (uv.y-37.)/3. ), stepeq(uv.x, 18.)*step(36.,uv.y)*step(uv.y,40.) );
		fgcol = mix( fgcol, COL(43.,43.,43.), stepeq(uv.x, 19.)*step(37.,uv.y)*step(uv.y,40.) );

		fgcol = mix( fgcol, mix( COL(84.,84.,84.), COL(108.,108.,108.), (uv.x-15.)/2. ), stepeq(uv.y, 32.)*step(15.,uv.x)*step(uv.x,17.) );
		fgcol = mix( fgcol, COL(81.,81.,81.), stepeq(uv.y, 32.)*step(20.,uv.x)*step(uv.x,21.) );

		col = mix( col, fgcol, onRect( uv, prisoncoords.xy, prisoncoords.zw ) );
	}
// flag
	else if( decorationHash > 0.63 && material < (NUM_MATERIALS+1) ) {		
		vec2 uvc = uv-vec2(32.,30.);
	
	// shadow	
		vec4 shadowcoords = vec4( 14., 7., 
								  54., max( 56. + sin( uv.x*0.32-1. ),56.) ); 
		col *= 1.-0.3*onRect( uv,  vec2( 6., 6. ), vec2( 61., 7. ) );
		col *= 1.-0.3*clamp( 0.25*(56.-uv.x), 0., 1.)*onRect( uv, shadowcoords.xy, shadowcoords.zw );

	// rod
		col = mix( col, COL(250.,167.,98.), onLineSegmentX( vec2( abs(uv.x-32.), uv.y ), 26., 4., 6.5 ) );
		col = mix( col, COL(251.,242.,53.), onLineSegmentY( uv, 5., 4., 60. ) );
		col = mix( col, COL(155.,76.,17.), onLineSegmentY( uv, 6., 4., 60. ) );
		col = mix( col, COL(202.,96.,25.), onLineSegmentY( vec2( abs(uv.x-32.), uv.y ), 6., 26., 28. ) );
		col = mix( col, COL(251.,242.,53.), onLineSegmentX( vec2( abs(uv.x-32.), uv.y ), 25., 3., 7. ) );
		col = mix( col, COL(252.,252.,217.), onLineSegmentX( vec2( abs(uv.x-32.), uv.y ), 25., 4.3, 5.5 ) );
		col = mix( col, COL(252.,252.,217.), onLineSegmentX( vec2( abs(uv.x-32.), uv.y ), 26., 5.3, 5.5 ) );
		col = mix( col, COL(0.,0.,0.), onLineSegmentY( vec2( abs(uv.x-32.), uv.y ), 6., 18.3, 19.5 ) );

	// flag	
		vec4 flagcoords = vec4( 13., min( 9.5 - pow(5.5* (uvs.x-0.5), 2.), 9. ), 
						    51., max( 55. + sin( uv.x*0.4+2.7 ),55.) ); 
	
		fgcol = COL(206.,34.,28.);
		fgcol = mix( fgcol, COL(235.,196.,58.), onBand( abs(uvc.x), 14., 15.5 ) );
		fgcol = mix( fgcol, COL(235.,196.,58.), onBand( uv.y, 49., 50.5 ) * step( abs(uvc.x), 15.5 ) );

		float dia = abs(uvc.x) + abs(uvc.y);
		fgcol = mix( fgcol, COL(235.,196.,58.), step( dia, 11. ) );
		fgcol = mix( fgcol, COL(40.,42.,48.), step( dia, 8.5 ) );
		fgcol = mix( fgcol, COL(248.,224.,96.), step( max(abs(uvc.x), abs(uvc.y)), 3.5 ) );
		fgcol = mix( fgcol, COL(206.,34.,28.), step( dia, 2. ) );
	
		fgcol *= (0.8+0.2*sin( uv.x*0.4+2.7 ));
		fgcol *= (0.8+0.2*clamp( 0.5*(uv.y-7.), 0., 1.));
	
	// mix flag on background
		col = mix( col, fgcol, onRect( uv, flagcoords.xy, flagcoords.zw ) );
	}
	
// fake 8-bit color palette and dithering	
	float steps = max(4.0, floor(ditherDepth + 0.5));
	col = floor( (col+0.5*mod(uv.x+uv.y,2.)/steps)*steps)/steps;

// Audio-reactive 64x64 pixel-aligned FFT spectrum glow on walls and doors
	float specAmt = wallSpectrum * audioResponse;
	if( specAmt > 0.001 ) {
		float colIdx = floor( uv.x / 4.0 );
		float sym = abs( colIdx - 7.5 ) / 8.0;
		float binU = clamp( 0.03 + 0.66 * sym + fract(decorationHash * 3.7) * 0.12, 0.02, 0.92 );
		float fft = IMG_NORM_PIXEL( audioFFT, vec2(binU, 0.5) ).r;
		float hNorm = 1.0 - uv.y / 64.0;
		float barH = clamp( fft * 0.92, 0.0, 1.0 );
		float inBar = step( hNorm, barH );
		float crest = smoothstep( 0.055, 0.0, abs(hNorm - barH) ) * step( 0.06, barH );
		float rung = 0.72 + 0.28 * step( 1.0, mod(uv.y, 4.0) );
		float seamBoost = 1.0 + mortarMask * 0.9;

		vec3 eqTint = COL(255., 154., 48.);
		if( material == 1 ) eqTint = COL(66., 204., 255.);
		else if( material == 2 ) eqTint = COL(255., 96., 38.);
		else if( material == MATERIAL_DOOR || material == MATERIAL_DOORWAY ) eqTint = COL(88., 255., 238.);

		col += eqTint * (inBar * fft * 0.26 * rung * seamBoost + crest * (0.48 + AUDIO_HIGH * 0.52)) * specAmt;
	}
}

bool getObjectColor( const int object, in vec2 uv, inout vec3 icol ) {
	uv = floor( mod(uv, vec2(64.)) );
	vec2 uvs = uv / 64.;
	vec3 col = vec3(20./255.);
	float d;
	
// only a lamp for now
	
	// lamp top
	d = distance( uv*vec2(1.,2.), vec2(28.1, 5.8)*vec2(1.,2.) );
	col = mix( col, mix( COL(41.,250.,46.), COL(13.,99.,12.), clamp( d/8.-0.2, 0., 1.) ), 
			  onCircle(uv, vec2(31.,13.6), 11.7 )*step( uv.y, 6. )); 
	col = mix( col, COL(9.,75.,6.), onCircleLine( uv, vec2(31.,14.), 11.6 ) *
			  step( length(uv-vec2(31.,13.6)), 11.7 )*step( uv.y, 6. ) );
	col = mix( col, COL(100.,100.,100.), onLine( abs(uv.x-31.), 1. )*step( uv.y, 1. ) );
	col = mix( col, COL(140.,140.,140.), onLine( abs(uv.x-31.), 0.25 )*step( uv.y, 1. )*step( 1., uv.y ) );
	
	// lamp bottom
	d = distance( uv*vec2(1.,2.), vec2(30.5, 6.5)*vec2(1.,2.) );
	col = mix( col, mix( COL(41.,250.,46.), COL(13.,99.,12.), clamp( abs(uv.x-31.)/4.-1.25, 0., 1. )), step( abs(uv.x-31.), 9. )*stepeq( uv.y, 7.) );
	col = mix( col, mix( COL(41.,250.,46.), COL(16.,123.,17.), clamp( abs(uv.x-31.)/4.-1.25, 0., 1. )), step( abs(uv.x-31.), 9. )*stepeq( uv.y, 8.) );
	col = mix( col, mix( COL(133.,250.,130.), COL(22.,150.,23.), clamp( abs(uv.x-31.)/4.-0.75, 0., 1. )), step( abs(uv.x-31.), 7. )*stepeq( uv.y, 9.) );

	col = mix( col, mix( COL(255.,251.,187.), col, clamp( d/4.5-0.6, 0., 1.) ), 
			  onCircle(uv, vec2(31.,1.), 10.2 )*step( uv.y, 8. )*step( 7., uv.y )); 
	col = mix( col, mix( COL(255.,255.,255.), col, clamp( d/4.-0.7, 0., 1.) ), 
			  onCircle(uv, vec2(31.,1.), 7.2 )*step( uv.y, 8. )*step( 7., uv.y )); 
		
	// floor
	d = distance( vec2(mod(uv.x, 32.),uv.y)*vec2(1.5,30./3.), vec2(16., 61.5)*vec2(1.5,30./3.) );
	col = mix( col, mix( COL(168.,168.,168.), COL(124.,124.,124.), clamp(d/15.-0.5, 0., 1.) ), step(d,24.5)); 
	col = mix( col, mix( COL(124.,124.,124.), COL(140.,140.,140.), clamp((uv.y-59.)/1., 0., 1.)), step(59.,uv.y)*step(uv.x, 57.)*step(7.,uv.x)); 
	col = mix( col, mix( COL(168.,168.,168.), COL(124.,124.,124.), clamp(abs(32.-uv.x)/10.-2., 0., 1.)), step(uv.y, 62.)*step(62.,uv.y)*step(uv.x, 61.)*step(3.,uv.x)); 
	col = mix( col, mix( COL(152.,152.,152.), COL(124.,124.,124.), clamp(abs(32.-uv.x)/10.-2.25, 0., 1.)), step(uv.y, 61.)*step(61.,uv.y)*step(uv.x, 59.)*step(5.,uv.x)); 

	float steps = max(4.0, floor(ditherDepth + 0.5));
	col = floor( (col)*steps)/steps;
	if( any(notEqual(col, vec3(floor((20./255.)*steps)/steps))) ) {
		float lampEnergy = (AUDIO_HIGH * 0.65 + AUDIO_BEAT * 0.95 + AUDIO_MID * 0.3) * lampPulse * audioResponse;
		if( lampEnergy > 0.001 ) {
			if( uv.y >= 6.5 && uv.y <= 9.5 ) {
				col = col * (1.0 + lampEnergy * 1.15) + vec3(0.42, 0.48, 0.24) * lampEnergy;
			} else if( uv.y < 6.5 ) {
				col *= 1.0 + lampEnergy * 0.55;
			} else if( uv.y > 54.0 ) {
				col += vec3(0.14, 0.45, 0.16) * lampEnergy * 0.35;
			}
		}
		icol = col;
		return true;
	}
	return false;
}

//----------------------------------------------------------------------
// Procedural MAP functions

bool isWall( const vec2 vos ) {
	return vos.y<0.4*ROOM_SIZE || vos.y>2.75*ROOM_SIZE || any( equal( mod( vos, vec2( ROOM_SIZE ) ), vec2(0.,0.) ) );
}
bool isDoor( const vec2 vos ) {
	return isWall(vos) && ((hash(vos)>0.75 &&  any( equal( mod( vos, vec2( ROOM_SIZE*0.5 ) ), vec2(2.) ) )) 
		    || any( equal( mod( vos, vec2( ROOM_SIZE ) ), vec2(ROOM_SIZE*0.5) ) )); 
}
bool isObject( const vec2 vos ) {
	return hash( vos*10. ) > 0.95;
}
bool map( const vec2 vos ) {
	return isObject( vos ) || isWall( vos );
}

//----------------------------------------------------------------------
// Render MAP functions

bool intersectSprite( const vec3 ro, const vec3 rd, const vec3 vos, const vec3 nor, out vec2 uv, out float spriteDist ) {
	float dist, u;
	vec2 a = vos.xz + nor.zx*vec2(-0.5,0.5) + vec2(0.5, 0.5);
	vec2 b = vos.xz - nor.zx*vec2(-0.5,0.5) + vec2(0.5, 0.5);
	if( intersectSegment( ro, rd, a, b, dist, u) ) {
		spriteDist = dist;
		uv.x = u; uv.y = 1.-(ro+dist*rd).y;
		if( sign(nor.x)<0. ) uv.x = 1.-uv.x;
		return uv.y>0.&&uv.y<1.;
	}
	spriteDist = 0.0;
	return false;
}
int getMaterialId( const vec2 vos ) {
	return int( mod( 521.21 * hash( floor((vos-vec2(0.5))/ROOM_SIZE )  ), float(NUM_MATERIALS)) );
}
bool getColorForPosition(
	const vec3 ro,
	const vec3 rd,
	const vec3 vos,
	const vec3 pos,
	const vec3 nor,
	const float cellDist,
	inout vec3 col,
	inout float hitDist,
	inout bool hitSurface,
	inout bool isLampHit,
	inout vec3 glowAccum
) {	
	vec2 uv;
	float spriteDist;

	if( isWall( vos.xz ) ) {
		if( isDoor( vos.xz ) ) {
			if( intersectSprite( ro, rd, vos+nor*0.03, nor, uv, spriteDist ) ) {
				// open the door (with subtle beat/bass kick jolt)
				float jolt = (AUDIO_BEAT * 0.3 + AUDIO_BASS * 0.16) * doorReact * audioResponse;
				uv.x -= clamp( 2.-0.75*distance( ro.xz, vos.xz+vec2(0.5) ) + jolt, 0., 1.);
				if( uv.x > 0. ) {
					getMaterialColor( MATERIAL_DOOR, uv*64., hash( vos.xz ), col );
					hitDist = spriteDist;
					hitSurface = true;
					return true;
				}	
			}	
			return false;
		}
		// a wall is hit
		if( pos.y <= 1. && pos.y >= 0. ) {
			vec2 mpos = vec2( dot(vec3(-nor.z,0.0,nor.x),pos), -pos.y );
    		float sha = 0.6 + 0.4*abs(nor.z);		
			getMaterialColor( isDoor( vos.xz+nor.xz )?MATERIAL_DOORWAY:getMaterialId(vos.xz), mpos*64., hash( vos.xz ), col );
			col *= sha;
			hitDist = cellDist;
			hitSurface = true;
			return true;
		}
		return true;
	}
	if( isObject( vos.xz ) && !isWall( vos.xz+vec2(1.,0.) ) && !isWall( vos.xz+vec2(-1.,0.) )
	    && !isWall( vos.xz+vec2(0.,-1.) ) && !isWall( vos.xz+vec2(0.,1.) ) &&
	    intersectSprite( ro, rd, vos, rdcenter, uv, spriteDist ) ) {
		if( getObjectColor( 0, uv*64., col ) ) {
			hitDist = spriteDist;
			hitSurface = true;
			isLampHit = true;
			return true;
		}
		float lampAmt = lampPulse * audioResponse;
		if( lampAmt > 0.001 ) {
			float lampEnergy = (AUDIO_HIGH * 0.65 + AUDIO_BEAT * 0.95 + AUDIO_MID * 0.3) * lampAmt;
			vec2 lampUv = uv * 64.0;
			float dBulb = length( (lampUv - vec2(31.0, 8.5)) * vec2(1.0, 1.35) );
			float halo = exp( -dBulb * 0.15 ) * lampEnergy * 0.58 / (1.0 + 0.12 * spriteDist);
			glowAccum += vec3(0.32, 1.0, 0.38) * halo;
		}
	}
	return false;
}

bool castRay(
	const vec3 ro,
	const vec3 rd,
	inout vec3 col,
	out float hitDist,
	out bool hitSurface,
	out bool isLampHit,
	out vec3 glowAccum
) {
	vec3 pos = floor(ro);
	vec3 safeRd = vec3(
		abs(rd.x) < 1e-5 ? (rd.x < 0.0 ? -1e-5 : 1e-5) : rd.x,
		abs(rd.y) < 1e-5 ? (rd.y < 0.0 ? -1e-5 : 1e-5) : rd.y,
		abs(rd.z) < 1e-5 ? (rd.z < 0.0 ? -1e-5 : 1e-5) : rd.z
	);
	vec3 ri = 1.0/safeRd;
	vec3 rs = sign(safeRd);
	vec3 dis = (pos-ro + 0.5 + rs*0.5) * ri;
	
	vec3 mm = vec3(0.0);
	bool hit = false;
	hitDist = float(MAXSTEPS);
	hitSurface = false;
	isLampHit = false;
	glowAccum = vec3(0.0);
	
	for( int i=0; i<MAXSTEPS; i++ )	{
		if( hit ) break;
		
		mm = step(dis.xyz, dis.zyx);
		dis += mm * rs * ri;
        pos += mm * rs;
		
		if( map(pos.xz) ) { 
			vec3 mini = (pos-ro + 0.5 - 0.5*vec3(rs))*ri;
			float t = max ( mini.x, mini.z );			
			hit = getColorForPosition( ro, rd, pos, ro+rd*t, -mm*rs, t, col, hitDist, hitSurface, isLampHit, glowAccum );
		}
	}
	return hit;
}

//----------------------------------------------------------------------
// Some really ugly code

#define CCOS(a) cos(clamp(a,0.,1.)*1.57079632679)
#define CSIN(a) sin(clamp(a,0.,1.)*1.57079632679)
vec3 path( const float t ) {
	float tmod = mod( t/SECONDS_IN_ROOM, 8. );
	
	vec3 pos = vec3( 4.*ROOM_SIZE*floor(t/(SECONDS_IN_ROOM*8.))+0.5, 0.5, 0.5*ROOM_SIZE+0.5 );	
	return pos + ROOM_SIZE*vec3(
		clamp(tmod,0.,1.)+clamp(tmod-4.,0.,1.)+0.5*(2.+CSIN(tmod-1.)-CCOS(tmod-3.)+CSIN(tmod-5.)-CCOS(tmod-7.)), 0.,
		clamp(tmod-2.,0.,1.)-clamp(tmod-6.,0.,1.)+0.5*(-CCOS(tmod-1.)+CSIN(tmod-3.)+CCOS(tmod-5.)-CSIN(tmod-7.)) );
}

//----------------------------------------------------------------------
// Pass 0: integrate walk time smoothly so audio surges never step backward
// Channels: r = sub-second [0..1), g = seconds 0..47 / 48, b = 48s blocks 0..47 / 48, a = smoothed pulse

vec4 updateWalkState() {
	vec4 prev = texelFetch( walkState, ivec2(0, 0), 0 );
	float subSec = prev.r;
	float sec = floor( prev.g * 48.0 + 0.5 );
	float blk = floor( prev.b * 48.0 + 0.5 );
	float smoothPulse = prev.a;

	float dt = clamp( TIMEDELTA, 0.0, 0.1 );
	float ar = audioResponse;
	float audioBoost = (AUDIO_BASS * 0.72 + AUDIO_BEAT * 0.95) * audioSpeed * ar;
	float dir = speed < 0.0 ? -1.0 : 1.0;
	float rate = speed + dir * audioBoost;

	float nextSub = subSec + dt * rate;
	float carrySec = floor( nextSub );
	nextSub -= carrySec;

	float nextSec = sec + carrySec;
	float carryBlk = floor( nextSec / 48.0 );
	nextSec = mod( nextSec, 48.0 );
	float nextBlk = mod( blk + carryBlk, 48.0 );

	float targetPulse = clamp( (AUDIO_BEAT * 0.72 + AUDIO_BASS * 0.48) * ar, 0.0, 1.0 );
	float nextPulse = dt > 0.0
		? mix( smoothPulse, targetPulse, 1.0 - exp(-dt * 12.0) )
		: smoothPulse;

	return vec4(
		clamp( nextSub, 0.0, 0.9995 ),
		nextSec / 48.0,
		nextBlk / 48.0,
		clamp( nextPulse, 0.0, 1.0 )
	);
}

//----------------------------------------------------------------------
// Main

void main() {
	if( PASSINDEX == 0 ) {
		gl_FragColor = updateWalkState();
		return;
	}

	vec2 q = isf_FragNormCoord;
	if( pixelate > 0.001 ) {
		float cols = mix( 480.0, 140.0, pixelate );
		float rows = max( 1.0, floor(cols * RENDERSIZE.y / max(RENDERSIZE.x, 1.0)) );
		q = (floor(q * vec2(cols, rows)) + 0.5) / vec2(cols, rows);
	}
    vec2 p = -1.0 + 2.0*q;
    p.x *= RENDERSIZE.x / max(RENDERSIZE.y, 1.0);

	vec4 st = texelFetch( walkState, ivec2(0, 0), 0 );
	float walkTime = 40.0 + floor(st.b * 48.0 + 0.5) * 48.0 + floor(st.g * 48.0 + 0.5) + st.r;
	float ar = audioResponse;
	float moveScale = clamp( abs(speed) + (AUDIO_BASS + AUDIO_BEAT) * audioSpeed * ar, 0.0, 1.5 );

	vec3 ro = path( walkTime );
	vec3 ta = path( walkTime + 0.1 );

	// Classic FPS head bob + vertical stomp on kicks
	float bobY = (sin(walkTime * 7.5) * 0.032 * min(moveScale, 1.0) - AUDIO_BEAT * 0.065 * ar) * headBob;
	ro.y = clamp( 0.5 + bobY, 0.25, 0.75 );
	ta.y = ro.y;

    rdcenter = rotate( normalize( ta - ro ), lookSway * cos(walkTime * 0.75) );
    vec3 uu = normalize( cross( vec3(0.,1.,0.), rdcenter ) );
    vec3 vv = normalize( cross( rdcenter, uu ) );

	// Subtle camera roll tilt synced to stride and alternating kicks
	float beatSign = mod( float(max(BEAT_COUNT, 0)), 2.0 ) < 0.5 ? 1.0 : -1.0;
	float roll = (sin(walkTime * 3.75) * 0.02 * min(moveScale, 1.0) + beatSign * AUDIO_BEAT * 0.045 * ar) * headBob;
	if( abs(roll) > 1e-4 ) {
		float cr = cos(roll), sr = sin(roll);
		vec3 u2 = uu * cr + vv * sr;
		vec3 v2 = vv * cr - uu * sr;
		uu = u2;
		vv = v2;
	}

	float effFov = max( 0.75, fov - (AUDIO_BASS * 0.24 + AUDIO_BEAT * 0.42) * fovPulse * ar );
    vec3 rd = normalize( p.x*uu + p.y*vv + effFov*rdcenter );
	
	vec3 col = rd.y>0.?vec3(56./255.):vec3(112./255.);
	float hitDist;
	bool hitSurface;
	bool isLampHit;
	vec3 glowAccum;
	castRay( ro, rd, col, hitDist, hitSurface, isLampHit, glowAccum );

	// Floor & ceiling perspective distance + pulsing green lamp light pools
	if( !hitSurface ) {
		float planeDist = rd.y > 0.0
			? (1.0 - ro.y) / max(rd.y, 1e-4)
			: ro.y / max(-rd.y, 1e-4);
		planeDist = min( planeDist, float(MAXSTEPS) );
		hitDist = planeDist;

		float lampAmt = lampPulse * ar;
		if( lampAmt > 0.001 ) {
			vec2 fp = ro.xz + rd.xz * planeDist;
			vec2 fCell = floor( fp );
			if( isObject( fCell ) && !isWall( fCell )
				&& !isWall( fCell + vec2(1., 0.) ) && !isWall( fCell + vec2(-1., 0.) )
				&& !isWall( fCell + vec2(0., -1.) ) && !isWall( fCell + vec2(0., 1.) ) ) {
				float dCenter = length( fract(fp) - 0.5 );
				float pool = smoothstep( 0.55, 0.05, dCenter );
				float lampEnergy = (AUDIO_HIGH * 0.65 + AUDIO_BEAT * 0.95 + AUDIO_MID * 0.3) * lampAmt;
				col += vec3(0.22, 0.78, 0.28) * pool * lampEnergy * (rd.y > 0.0 ? 0.35 : 0.28);
			}
		}
	}

	// Distance corridor shadow + beat torchlight flash
	float flash = (AUDIO_BEAT * 0.75 + AUDIO_BASS * 0.35) * beatFlash * ar;
	if( !isLampHit ) {
		if( fogAmount > 0.001 ) {
			float fogK = fogAmount * 0.095 / (1.0 + flash * 1.1);
			col *= exp( -hitDist * fogK );
		}
		if( flash > 0.001 ) {
			float torch = exp( -hitDist * 0.14 );
			col *= 1.0 + flash * (0.26 + 0.52 * torch);
		}
	}
	col += glowAccum;

	float totalHue = hueShift + (AUDIO_MID * 0.32 + AUDIO_BEAT * 0.22) * audioHue * ar;
	if( abs(totalHue) > 0.001 ) {
		col = max( rotateHue(col, totalHue), vec3(0.0) );
	}

	col *= brightness;
	gl_FragColor = vec4( col, 1.0 );
}
