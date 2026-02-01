// Vertex shader for vector field arrows using stereographic projection
// Renders arrows as triangles: solid arrowhead + screen-space thickened stem
//
// Vertex types (9 vertices per arrow):
//   0-5: stem quad (2 triangles) with screen-space thickness
//   6-8: arrowhead triangle (barb1, tip, barb2)

#include <vector_field.inc.vert>

attribute float vertexType;

uniform float fieldScale;
uniform float arrowHeadScale;
uniform float latCutoff; // in degrees, 90 = full sphere
uniform float lineWidth; // in pixels
uniform vec2 resolution; // screen resolution
uniform float t; // warp parameter: 0 = original, 1 = opposite side of circle
uniform float maxScreenLen; // max arrow length in pixels

void main() {
    vec2 uv = position.xy;
    
    // Compute sphere position and tangent
    vec3 spherePos = stereoInverse(uv);
    vec2 field2D = vectorField2D(uv);
    vec3 tangent3D = stereoTangent(uv, field2D);
    float tangentLen = length(tangent3D);

    // Check latitude cutoff
    float latRad = asin(clamp(spherePos.z, -1.0, 1.0));
    float cutoffRad = latCutoff * PI / 180.0;
    if (latRad > cutoffRad) {
        gl_Position = vec4(0.0, 0.0, -1e10, 1.0); // discard by placing far away
        return;
    } 
 
    // Apply warp transformation to position and tangent
    vec3 warpedTangent = warpTangent(spherePos, tangent3D, t);
    vec3 warpedPos = warpPosition(spherePos, tangent3D, t);
    tangent3D = warpedTangent;

    // Discard arrows on the back side of the sphere
    // Check if normal facing away from camera (perspective-correct).
    // For a unit sphere centered at origin, normal = position.
    // In view space, camera is at origin, so view ray direction = viewPos.
    // Back-facing if dot(viewNormal, viewPos) > 0.
    vec3 viewPos = (modelViewMatrix * vec4(warpedPos, 1.0)).xyz;
    vec3 viewNormal = mat3(modelViewMatrix) * warpedPos;
    if (dot(viewNormal, viewPos) > 0.0) {
        gl_Position = vec4(0.0, 0.0, -1e10, 1.0); // discard by placing far away
        return;
    }

    // Scale down the arrow if it's too large in screen space (close to camera)
    // Compute approximate screen-space arrow length and cap it
    vec4 baseClipTest = projectionMatrix * modelViewMatrix * vec4(warpedPos, 1.0);
    vec4 tipClipTest = projectionMatrix * modelViewMatrix * vec4(warpedPos + tangent3D * fieldScale, 1.0);
    vec2 baseScreenTest = (baseClipTest.xy / baseClipTest.w) * resolution * 0.5;
    vec2 tipScreenTest = (tipClipTest.xy / tipClipTest.w) * resolution * 0.5;
    float screenLen = length(tipScreenTest - baseScreenTest);
    float arrowScale = screenLen > maxScreenLen ? maxScreenLen / screenLen : 1.0;
    tangent3D *= arrowScale;
    tangentLen *= arrowScale;

    vec3 pretubedPos = pretubePoint(warpedPos, pointWrapAmount(spherePos, warpedPos), isFlipped(spherePos, warpedPos));
    warpedPos = pretubedPos;

    // Compute arrow positions
    vec3 base = warpedPos;
    vec3 tip = warpedPos + tangent3D * fieldScale;
    
    // Arrowhead barbs (safe normalize with fallback)
    vec3 backDir = tangentLen > 0.0000001 ? -tangent3D / tangentLen : vec3(0.0);
    vec3 crossProd = cross(warpedPos, tangent3D);
    float crossLen = length(crossProd);
    vec3 perpDir = crossLen > 0.0000001 ? crossProd / crossLen : vec3(0.0);
    float headSize = tangentLen * fieldScale * arrowHeadScale;
    
    vec3 barb1 = tip + (backDir + perpDir) * headSize;
    vec3 barb2 = tip + (backDir - perpDir) * headSize;
    
    float vtype = vertexType;
    
    if (vtype > 5.5) {
        // Arrowhead triangle: types 6, 7, 8 -> barb1, tip, barb2
        vec3 pos;
        if (vtype < 6.5) pos = barb1;
        else if (vtype < 7.5) pos = tip;
        else pos = barb2;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    } else {
        // Stem quad: screen-space thickening
        // Triangle 1: base-left(0), base-right(1), tip-right(2)
        // Triangle 2: base-left(3), tip-right(4), tip-left(5)
        
        // Transform base and tip to clip space
        vec4 baseClip = projectionMatrix * modelViewMatrix * vec4(base, 1.0);
        vec4 tipClip = projectionMatrix * modelViewMatrix * vec4(tip, 1.0);
        
        // Convert to NDC
        vec2 baseNDC = baseClip.xy / baseClip.w;
        vec2 tipNDC = tipClip.xy / tipClip.w;
        
        // Direction in screen space (pixels)
        vec2 dir = (tipNDC - baseNDC) * resolution * 0.5;
        float dirLen = length(dir);
        
        // Perpendicular offset in NDC (with fallback for zero-length)
        vec2 offsetNDC;
        if (dirLen > 0.001) {
            vec2 perp = vec2(-dir.y, dir.x) / dirLen; // perpendicular, 1 pixel length
            offsetNDC = perp * lineWidth / resolution;
        } else {
            offsetNDC = vec2(lineWidth / resolution.x, 0.0);
        }
        
        // Determine which corner this vertex is
        vec4 clipPos;
        if (vtype < 0.5 || (vtype > 2.5 && vtype < 3.5)) {
            // base-left (types 0, 3)
            clipPos = baseClip;
            clipPos.xy = (baseNDC - offsetNDC) * baseClip.w;
        } else if (vtype < 1.5) {
            // base-right (type 1)
            clipPos = baseClip;
            clipPos.xy = (baseNDC + offsetNDC) * baseClip.w;
        } else if (vtype < 2.5 || (vtype > 3.5 && vtype < 4.5)) {
            // tip-right (types 2, 4)
            clipPos = tipClip;
            clipPos.xy = (tipNDC + offsetNDC) * tipClip.w;
        } else {
            // tip-left (type 5)
            clipPos = tipClip;
            clipPos.xy = (tipNDC - offsetNDC) * tipClip.w;
        }
        
        gl_Position = clipPos;
    }
}
