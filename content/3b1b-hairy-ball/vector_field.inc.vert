// Common vector field functions for stereographic projection
// Include this file in both sphere.vert and field.vert
//
// === Stereographic Projection Setup ===
// We use stereographic projection with the north pole (0, 0, 1) as the projection center.
// A light at the north pole casts shadows of points on the sphere onto the z=0 plane.
//
// Key properties:
// - The south pole (0, 0, -1) maps to the origin (0, 0) on the plane
// - The equator (z=0) maps to the unit circle on the plane
// - The north pole maps to infinity (it's the projection center)
// - Vectors become infinitely dense near the north pole, but the south pole is fine
//
// === Vector Field Strategy ===
// Instead of defining the vector field in (longitude, latitude) coordinates,
// we define it on the infinite 2D stereographic plane as a simple constant field: (1, 0).
// This 2D field is then "lifted" back onto the sphere using the Jacobian of the
// stereographic projection, producing tangent vectors on the sphere surface.
//
// The projection naturally handles the varying density - vectors shrink near the
// south pole and grow near the north pole (where they become infinitely dense).

#define PI 3.14159265359

// Stereographic inverse projection: (u, v) on plane -> (x, y, z) on unit sphere
// Given a point on the z=0 plane, finds where a ray from the north pole through
// that point intersects the unit sphere.
//
// Formula derivation:
//   Ray from north pole (0,0,1) through plane point (u,v,0):
//   P(t) = (1-t)*(0,0,1) + t*(u,v,0) = (t*u, t*v, 1-t)
//   On unit sphere: |P|² = 1 => t²u² + t²v² + (1-t)² = 1
//   Solving: t = 2/(u² + v² + 1)
//
// Results:
//   (0, 0) -> (0, 0, -1)  south pole
//   unit circle -> equator (z=0)
//   |uv| -> ∞ approaches north pole (0, 0, 1)
vec3 stereoInverse(vec2 uv) {
    float r2 = dot(uv, uv);
    float denom = r2 + 1.0;
    return vec3(
        2.0 * uv.x / denom,
        2.0 * uv.y / denom,
        (r2 - 1.0) / denom
    );
}

// Stereographic forward projection: (x, y, z) on unit sphere -> (u, v) on plane
// Given a point on the sphere, finds where a ray from the north pole through
// that point intersects the z=0 plane. Inverse of stereoInverse.
//
// Formula derivation:
//   Ray from north pole (0,0,1) through sphere point (x,y,z):
//   P(t) = (0,0,1) + t*((x,y,z) - (0,0,1)) = (t*x, t*y, 1 + t*(z-1))
//   At z=0: 1 + t*(z-1) = 0 => t = 1/(1-z)
//   Plane point: (x/(1-z), y/(1-z))
//
// Results:
//   (0, 0, -1) south pole -> (0, 0)
//   equator (z=0) -> unit circle
//   (0, 0, 1) north pole -> infinity (undefined)
vec2 stereoForward(vec3 p) {
    float denom = 1.0 - p.z;
    if (abs(denom) < 0.0001) {
        // Near north pole, return large value
        return vec2(1e10, 0.0);
    }
    return vec2(p.x / denom, p.y / denom);
}

// Jacobian of stereographic inverse: transforms 2D tangent vector to 3D
// Given a point (u,v) on the plane and a 2D vector field value at that point,
// computes the corresponding 3D tangent vector on the sphere surface.
//
// This is the derivative of stereoInverse with respect to (u,v):
//   dP/du and dP/dv are the tangent vectors on the sphere corresponding to
//   the u and v directions on the plane.
//   For a 2D field vector (fu, fv), the 3D tangent is: fu * dP/du + fv * dP/dv
//
// The Jacobian naturally handles the "stretching" of the projection:
// - Near the south pole (small |uv|), tangent vectors are larger
// - Near the north pole (large |uv|), tangent vectors shrink toward zero in 3D
//   but become infinitely dense on the sphere
vec3 stereoTangent(vec2 uv, vec2 field2D) {
    float u = uv.x;
    float v = uv.y;
    float r2 = u*u + v*v;
    float denom2 = (r2 + 1.0) * (r2 + 1.0);
    
    // Partial derivative of stereoInverse with respect to u
    vec3 dPdu = vec3(
        2.0 * (1.0 + v*v - u*u),
        -4.0 * u * v,
        4.0 * u
    ) / denom2;
    
    // Partial derivative of stereoInverse with respect to v
    vec3 dPdv = vec3(
        -4.0 * u * v,
        2.0 * (1.0 + u*u - v*v),
        4.0 * v
    ) / denom2;
    
    return field2D.x * dPdu + field2D.y * dPdv;
}

// The 2D vector field on the stereographic plane
// Currently a constant field pointing in the +u direction.
// This simple field, when projected onto the sphere, creates the characteristic
// "hairy ball" pattern with singularities at the poles.
vec2 vectorField2D(vec2 uv) {
    return vec2(1.0, 0.0);
}

// Given a 3D position on the unit sphere, compute the 3D tangent vector
// by projecting to stereographic plane, getting the 2D field, and lifting back.
// This is useful when we have a sphere position (e.g., from lat/lon) and need
// the vector field at that point.
vec3 getVectorField3D(vec3 spherePos) {
    vec2 uv = stereoForward(spherePos);
    vec2 field2D = vectorField2D(uv);
    return stereoTangent(uv, field2D);
}

// ============================================================================
// Warp transformation functions
// These implement the sphere deformation where each point moves along a great
// circle that is tangent to the vector field at that point.
// ============================================================================

// Rotate point p around axis by angle theta (right-hand rule)
// Uses Rodrigues' rotation formula:
//   p_rot = p*cos(θ) + (axis × p)*sin(θ) + axis*(axis · p)*(1 - cos(θ))
vec3 rotateAroundAxis(vec3 p, vec3 axis, float theta) {
    float c = cos(theta);
    float s = sin(theta);
    vec3 n = normalize(axis);
    return p * c + cross(n, p) * s + n * dot(n, p) * (1.0 - c);
}

// Compute the rotation axis for warping: perpendicular to both position and tangent
// The rotation axis is chosen so that rotating around it moves the point along
// a great circle that is tangent to the vector field direction.
vec3 getWarpRotationAxis(vec3 spherePos, vec3 tangent3D) {
    vec3 rotAxis = cross(spherePos, tangent3D);
    float rotAxisLen = length(rotAxis);
    if (rotAxisLen < 0.0001) {
        return vec3(0.0, 0.0, 1.0); // fallback axis for degenerate cases
    }
    return rotAxis / rotAxisLen;
}

// Apply warp transformation to a position on the sphere
// t=0: original position
// t=0.5: quarter way around the great circle
// t=1: opposite side of the great circle (half rotation, π radians)
vec3 warpPosition(vec3 spherePos, vec3 tangent3D, float t) {
    vec3 rotAxis = getWarpRotationAxis(spherePos, tangent3D);
    float angle = t * PI;
    return rotateAroundAxis(spherePos, rotAxis, angle);
}

// Apply warp transformation to a tangent vector
// The tangent vector rotates along with the position, maintaining its
// relationship to the sphere surface (it remains tangent to the sphere).
vec3 warpTangent(vec3 spherePos, vec3 tangent3D, float t) {
    vec3 rotAxis = getWarpRotationAxis(spherePos, tangent3D);
    float angle = t * PI;
    return rotateAroundAxis(tangent3D, rotAxis, angle);
}

bool isFlipped(vec3 originalPos, vec3 warpedPos) {
    return (originalPos.y < 0.0 && warpedPos.y > 0.0) || (originalPos.y > 0.0 && warpedPos.y < 0.0);
}

float pointWrapAmount(vec3 originalPos, vec3 warpedPos) {
    float diff = abs(warpedPos.y) / (abs(originalPos.y) + 0.5);
    return clamp(diff / 2.0, 0.0, 1.0);
}

vec3 pretubePoint(vec3 pos, float amount, bool isFlipped) {
    if (!isFlipped) {
        amount = -amount;
    }
    return pos * (1.0 + amount * 0.1);
}
