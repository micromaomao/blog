// Vertex shader: converts longitude/latitude to 3D sphere position
// Input: position.x = longitude (0 to 1), position.y = latitude (0 to 1)

#include <vector_field.inc.vert>

uniform float latCutoff; // in degrees, 90 = full sphere
uniform float t; // warp parameter: 0 = original, 1 = opposite side of circle

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vUntransformedPosition;

void main() {
    // Map from [0,1] to actual angles
    float lon = position.x * 2.0 * PI; // 0 to 2*PI
    float lat = (position.y - 0.5) * PI; // -PI/2 to PI/2
    
    // Store UV for fragment shader
    vUv = vec2(position.x, position.y);
    
    // Convert to 3D position on unit sphere
    // z = sin(lat) so north pole is at top
    float cosLat = cos(lat);
    vec3 spherePos = vec3(
        cosLat * cos(lon),
        cosLat * sin(lon),
        sin(lat)
    );
    
    // Store untransformed position for picking
    vUntransformedPosition = spherePos;
    
    // Check if above cutoff latitude
    float cutoffRad = latCutoff * PI / 180.0;
    if (lat > cutoffRad) {
        // Move vertex to infinity (will be clipped)
        spherePos = vec3(0.0, 0.0, 0.0) / 0.0;
    }
    
    // Get the 3D vector field at this point
    vec3 tangent3D = getVectorField3D(spherePos);
    
    // Warp the sphere: move along a great circle tangent to the field
    vec3 warpedPos = warpPosition(spherePos, tangent3D, t);
    
    vNormal = warpedPos; // For a unit sphere, normal = position

    vec3 pretubedPos = pretubePoint(warpedPos, pointWrapAmount(spherePos, warpedPos), isFlipped(spherePos, warpedPos));

    vPosition = pretubedPos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pretubedPos, 1.0);
}
