// Fragment shader: outputs untransformed sphere position as RGB
// Used for picking - renders to offscreen float texture
// Background (0,0,0) indicates outside sphere (no point on unit sphere is at origin)

varying vec3 vUntransformedPosition;

void main() {
    // Output the untransformed 3D position directly as RGB
    gl_FragColor = vec4(vUntransformedPosition, 1.0);
}
