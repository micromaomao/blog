// Fragment shader: chessboard pattern with lighting

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vUntransformedPosition;

uniform vec3 clickedPosition; // Position clicked by user, or (-2,-2,-2) if none
uniform float clickRadius; // Radius around clicked position to highlight

void main() {
    // Check if this fragment is near the clicked position
    float distToClicked = length(vUntransformedPosition - clickedPosition);
    bool isHighlighted = distToClicked < clickRadius && clickedPosition.x > -1.5;
    
    if (isHighlighted) {
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); // Red highlight
        return;
    }
    
    // Chessboard pattern: 10x10 blocks
    float u = vUv.x * 30.0;
    float v = vUv.y * 20.0;
    
    // Determine which cell we're in
    int cellX = int(floor(u));
    int cellY = int(floor(v));
    bool isEven = mod(float(cellX + cellY), 2.0) < 1.0;
    
    // Front face colors: #3D85C6 and #C4DAED
    // Back face colors: #C67E3D and #E8CBB1
    vec3 color1, color2;
    if (gl_FrontFacing) {
        color1 = vec3(0.239, 0.522, 0.776); // #3D85C6
        color2 = vec3(0.769, 0.855, 0.929); // #C4DAED
    } else {
        color1 = vec3(0.776, 0.494, 0.239); // #C67E3D
        color2 = vec3(0.910, 0.796, 0.694); // #E8CBB1
    }
    
    vec3 baseColor = isEven ? color1 : color2;
    
    // Lighten color as longitude (vUv.x) increases
    float longitudeFactor = vUv.x * 0.9; // 0 to 0.9 lightening
    baseColor = mix(baseColor, vec3(1.0), longitudeFactor);
    
    // Simple directional lighting from (-1, -1, -1)
    vec3 lightDir = normalize(vec3(-1.0, -1.0, -1.0));
    vec3 normal = normalize(vNormal);

    // Lambertian shading with ambient
    float ambient = 0.3;
    float diffuse = max(dot(normal, -lightDir), 0.0) * 0.7;
    float lighting = ambient + diffuse;
    
    vec3 finalColor = baseColor * lighting;
    
    gl_FragColor = vec4(finalColor, 1.0);
}
