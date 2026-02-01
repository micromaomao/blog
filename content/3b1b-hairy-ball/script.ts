import { onready, bind_container } from "js/jsmeta";
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// @ts-ignore
import sphereVertexShader from '!raw-loader!./sphere.vert';
// @ts-ignore
import sphereFragmentShader from '!raw-loader!./sphere.frag';
// @ts-ignore
import spherePositionFragmentShader from '!raw-loader!./sphere_position.frag';
// @ts-ignore
import fieldVertexShader from '!raw-loader!./field.vert';
// @ts-ignore
import fieldFragmentShader from '!raw-loader!./field.frag';
// @ts-ignore
import vectorFieldInclude from '!raw-loader!./vector_field.inc.vert';

// Process #include directives in shader source
function processShaderIncludes(source: string): string {
    return source.replace(/#include <([^>]+)>/g, (match, filename) => {
        if (filename === 'vector_field.inc.vert') {
            return vectorFieldInclude;
        }
        console.warn(`Unknown shader include: ${filename}`);
        return '';
    });
}

onready(async () => {
    let elem = bind_container("canvas");
    let canvas = document.createElement("canvas");
    elem.appendChild(canvas);

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf9f9fa);

    // Camera setup (z is up)
    const camera = new THREE.PerspectiveCamera(50, 1, 0.00001, 50);
    camera.up.set(0, 0, 1);
    camera.position.set(2.5, 2.5, 2);
    camera.lookAt(0, 0, 0);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

    // Orbit controls for rotation
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.rotateSpeed = 0.5;

    // === Create Axes with ticks and arrows ===
    const axisColor = 0x888888;
    const axisMin = -1.5;
    const axisMax = 1.5;
    const gridMin = -1;
    const gridMax = 1;
    const tickSpacing = 0.25;
    const tickSize = 0.03;

    // Store tick data for camera-facing updates (z-axis only)
    const tickData: { line: THREE.Line, pos: THREE.Vector3, axis: THREE.Vector3 }[] = [];

    function createAxis(direction: THREE.Vector3, withTicks: boolean) {
        const group = new THREE.Group();
        const material = new THREE.LineBasicMaterial({ color: axisColor });

        // Main axis line
        const points = [
            new THREE.Vector3().copy(direction).multiplyScalar(axisMin),
            new THREE.Vector3().copy(direction).multiplyScalar(axisMax)
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        group.add(line);

        // Ticks (only for z-axis)
        if (withTicks) {
            for (let t = axisMin; t < axisMax - 0.00001; t += tickSpacing) {
                if (Math.abs(t) < 0.001) continue; // Skip origin
                const pos = new THREE.Vector3().copy(direction).multiplyScalar(t);

                // Create tick with placeholder geometry (will be updated each frame)
                const tickGeom = new THREE.BufferGeometry().setFromPoints([pos.clone(), pos.clone()]);
                const tick = new THREE.Line(tickGeom, material);
                group.add(tick);
                tickData.push({ line: tick, pos: pos.clone(), axis: direction.clone() });
            }
        }

        // Arrow (cone) at positive end
        const coneGeometry = new THREE.ConeGeometry(0.02, 0.05, 4);
        const coneMaterial = new THREE.MeshBasicMaterial({ color: axisColor });
        const cone = new THREE.Mesh(coneGeometry, coneMaterial);

        // Position and rotate cone (cone points +Y by default)
        cone.position.copy(direction).multiplyScalar(axisMax);
        if (direction.x === 1) cone.rotation.z = -Math.PI / 2;      // point +X
        else if (direction.y === 1) { /* already points +Y */ }
        else if (direction.z === 1) cone.rotation.x = Math.PI / 2; // point +Z

        group.add(cone);
        return group;
    }

    scene.add(createAxis(new THREE.Vector3(1, 0, 0), false));
    scene.add(createAxis(new THREE.Vector3(0, 1, 0), false));
    scene.add(createAxis(new THREE.Vector3(0, 0, 1), true));

    // === Create grid at z=0 (horizontal x-y plane) ===
    const gridMaterial = new THREE.LineBasicMaterial({ color: axisColor });
    for (let t = gridMin; t <= gridMax + 0.001; t += tickSpacing) {
        // Lines parallel to x-axis
        const xLineGeom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(gridMin, t, 0),
            new THREE.Vector3(gridMax, t, 0)
        ]);
        scene.add(new THREE.Line(xLineGeom, gridMaterial));

        // Lines parallel to y-axis
        const yLineGeom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(t, gridMin, 0),
            new THREE.Vector3(t, gridMax, 0)
        ]);
        scene.add(new THREE.Line(yLineGeom, gridMaterial));
    }

    // === Create Sphere with custom shaders ===
    let latCutoff = 88; // degrees
    let warpT = 0; // warp parameter

    // Clicked position on sphere (in untransformed coordinates)
    // Use (-2, -2, -2) to indicate no click (outside valid range)
    let clickedPosition = new THREE.Vector3(-2, -2, -2);

    const sphereUniforms = {
        latCutoff: { value: latCutoff },
        t: { value: warpT },
        clickedPosition: { value: clickedPosition },
        clickRadius: { value: 0.01 }
    };

    const sphereMaterial = new THREE.ShaderMaterial({
        uniforms: sphereUniforms,
        vertexShader: processShaderIncludes(sphereVertexShader),
        fragmentShader: processShaderIncludes(sphereFragmentShader),
        side: THREE.DoubleSide
    });

    // Material for position picking (renders untransformed position as RGB)
    const spherePositionMaterial = new THREE.ShaderMaterial({
        uniforms: {
            latCutoff: sphereUniforms.latCutoff,
            t: sphereUniforms.t
        },
        vertexShader: processShaderIncludes(sphereVertexShader),
        fragmentShader: processShaderIncludes(spherePositionFragmentShader),
        side: THREE.DoubleSide
    });

    // Use PlaneGeometry as base - x is longitude [0,1], y is latitude [0,1]
    const sphereGeometry = new THREE.PlaneGeometry(1, 1, 1024, 1024);

    // Shift vertices so x: [0,1] and y: [0,1]
    const posAttr = sphereGeometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
        posAttr.setX(i, posAttr.getX(i) + 0.5);
        posAttr.setY(i, posAttr.getY(i) + 0.5);
    }
    posAttr.needsUpdate = true;

    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.frustumCulled = false; // Prevent disappearing due to frustum culling
    scene.add(sphere);

    // === Render target for position picking ===
    let pickingRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType
    });

    // === Create Vector Field ===
    const fieldUniforms = {
        fieldScale: { value: 0.05 },
        arrowHeadScale: { value: 0.3 },
        latCutoff: sphereUniforms.latCutoff,  // share with sphere
        lineWidth: { value: 2.0 },  // pixels
        resolution: { value: new THREE.Vector2(1, 1) },
        t: sphereUniforms.t,  // share with sphere
        maxScreenLen: { value: 60.0 }  // max arrow length in pixels
    };

    const fieldMaterial = new THREE.ShaderMaterial({
        uniforms: fieldUniforms,
        vertexShader: processShaderIncludes(fieldVertexShader),
        fragmentShader: processShaderIncludes(fieldFragmentShader),
        side: THREE.DoubleSide,
        depthTest: false
    });

    // Sample grid on stereographic plane
    const threshold = 10000000;
    const powStep = 1.2;
    const smallStep = 0.1;
    const powInit = 1.0;

    function step(cb: (x: number) => void) {
        for (let x = -powInit; x <= powInit; x += smallStep) {
            cb(x);
        }
        let abs = powInit * powStep;
        while (abs <= threshold) {
            for (let x of [-abs, abs]) {
                cb(x);
            }
            abs *= powStep;
        }
    }

    // Create geometry: 9 vertices per arrow (3 triangles)
    // Vertex types:
    //   0-5: stem quad (2 triangles for screen-space thick line)
    //        Triangle 1: base-left(0), base-right(1), tip-right(2)
    //        Triangle 2: base-left(3), tip-right(4), tip-left(5)
    //   6-8: arrowhead triangle: barb1(6), tip(7), barb2(8)

    let numArrows = 0;
    step(u => {
        step(v => {
            numArrows++;
        });
    });

    const vertsPerArrow = 9;
    const positions = new Float32Array(numArrows * vertsPerArrow * 3);
    const vertexTypes = new Float32Array(numArrows * vertsPerArrow);
    let baseVertIdx = 0;

    step(u => {
        step(v => {
            // All vertices share the same (u, v) position
            // The vertex shader computes 3D positions based on vertexType
            for (let j = 0; j < vertsPerArrow; j++) {
                positions[(baseVertIdx + j) * 3 + 0] = u;
                positions[(baseVertIdx + j) * 3 + 1] = v;
                positions[(baseVertIdx + j) * 3 + 2] = 0;
            }

            // Stem quad triangles
            vertexTypes[baseVertIdx + 0] = 0;  // base-left
            vertexTypes[baseVertIdx + 1] = 1;  // base-right
            vertexTypes[baseVertIdx + 2] = 2;  // tip-right
            vertexTypes[baseVertIdx + 3] = 3;  // base-left (copy)
            vertexTypes[baseVertIdx + 4] = 4;  // tip-right (copy)
            vertexTypes[baseVertIdx + 5] = 5;  // tip-left
            // Arrowhead triangle
            vertexTypes[baseVertIdx + 6] = 6;  // barb1
            vertexTypes[baseVertIdx + 7] = 7;  // tip
            vertexTypes[baseVertIdx + 8] = 8;  // barb2

            baseVertIdx += vertsPerArrow;
        });
    });

    const fieldGeometry = new THREE.BufferGeometry();
    fieldGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    fieldGeometry.setAttribute('vertexType', new THREE.BufferAttribute(vertexTypes, 1));

    const fieldMesh = new THREE.Mesh(fieldGeometry, fieldMaterial);
    scene.add(fieldMesh);

    // === Slider for latCutoff ===
    const sliderContainer = document.createElement("div");
    sliderContainer.className = "slider-container";

    const sliderLabel = document.createElement("label");
    sliderLabel.textContent = "Latitude Cutoff: ";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "-90";
    slider.max = "89.9";
    slider.step = "0.1";
    slider.value = String(latCutoff);

    const sliderValue = document.createElement("span");
    sliderValue.textContent = `${latCutoff}°`;

    slider.addEventListener("input", () => {
        latCutoff = parseFloat(slider.value);
        sphereUniforms.latCutoff.value = latCutoff;
        sliderValue.textContent = `${latCutoff}°`;
    });

    sliderContainer.appendChild(sliderLabel);
    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(sliderValue);
    elem.appendChild(sliderContainer);

    // === Slider for t (warp parameter) ===
    const tSliderContainer = document.createElement("div");
    tSliderContainer.className = "slider-container";

    const tSliderLabel = document.createElement("label");
    tSliderLabel.textContent = "t: ";

    const tSlider = document.createElement("input");
    tSlider.type = "range";
    tSlider.min = "0";
    tSlider.max = "1";
    tSlider.step = "0.001";
    tSlider.value = String(warpT);

    const tSliderValue = document.createElement("span");
    tSliderValue.textContent = warpT.toFixed(3);

    tSlider.addEventListener("input", () => {
        warpT = parseFloat(tSlider.value);
        sphereUniforms.t.value = warpT;
        tSliderValue.textContent = warpT.toFixed(3);
    });

    tSliderContainer.appendChild(tSliderLabel);
    tSliderContainer.appendChild(tSlider);
    tSliderContainer.appendChild(tSliderValue);
    elem.appendChild(tSliderContainer);

    // === Checkbox for vector field visibility ===
    const checkboxContainer = document.createElement("div");
    checkboxContainer.className = "slider-container";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "show-field";
    checkbox.checked = true;

    const checkboxLabel = document.createElement("label");
    checkboxLabel.htmlFor = "show-field";
    checkboxLabel.textContent = "Show vector field";

    checkbox.addEventListener("change", () => {
        fieldMesh.visible = checkbox.checked;
    });

    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(checkboxLabel);
    elem.appendChild(checkboxContainer);

    let clickMessage = document.createElement("div");
    const initClickMessage = "Click on the sphere to select a point.";
    clickMessage.textContent = initClickMessage;
    elem.appendChild(clickMessage);

    // === Resize handler ===
    function onResize() {
        const rect = elem.getBoundingClientRect();
        const width = rect.width;
        const height = 600; // Fixed height from CSS

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);

        // Update picking render target size
        const pixelWidth = Math.floor(width * window.devicePixelRatio);
        const pixelHeight = Math.floor(height * window.devicePixelRatio);
        pickingRenderTarget.setSize(pixelWidth, pixelHeight);

        // Update resolution uniform for screen-space line width
        fieldUniforms.resolution.value.set(
            width * window.devicePixelRatio,
            height * window.devicePixelRatio
        );
    }

    window.addEventListener('resize', onResize);
    onResize();

    // === Click handling for position picking ===
    let isDragging = false;
    let mouseDownPos = { x: 0, y: 0 };
    const dragThreshold = 5; // pixels

    canvas.addEventListener('mousedown', (e) => {
        isDragging = false;
        mouseDownPos = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mousemove', (e) => {
        const dx = e.clientX - mouseDownPos.x;
        const dy = e.clientY - mouseDownPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > dragThreshold) {
            isDragging = true;
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (isDragging) return; // Ignore drag releases

        // Get click position in canvas coordinates
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * window.devicePixelRatio;
        const y = (rect.height - (e.clientY - rect.top)) * window.devicePixelRatio; // Flip Y

        // Render position pass to picking target
        sphere.material = spherePositionMaterial;
        const originalBackground = scene.background;
        scene.background = new THREE.Color(0x000000); // Black background = invalid position

        // Hide other objects during picking
        const fieldVisible = fieldMesh.visible;
        fieldMesh.visible = false;

        renderer.setRenderTarget(pickingRenderTarget);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);

        // Restore scene
        sphere.material = sphereMaterial;
        scene.background = originalBackground;
        fieldMesh.visible = fieldVisible;

        // Read pixel at click position (float texture stores position directly)
        const pixelBuffer = new Float32Array(4);
        renderer.readRenderTargetPixels(
            pickingRenderTarget,
            Math.floor(x), Math.floor(y),
            1, 1,
            pixelBuffer
        );

        // Float texture stores position directly (no conversion needed)
        const posX = pixelBuffer[0];
        const posY = pixelBuffer[1];
        const posZ = pixelBuffer[2];

        // Check if we hit the sphere: (0,0,0) means background (no point on unit sphere is at origin)
        if (posX !== 0 || posY !== 0 || posZ !== 0) {
            clickedPosition.set(posX, posY, posZ);
            console.log('Clicked sphere position:', posX, posY, posZ);

            let lat = Math.asin(posZ) * (180 / Math.PI);
            let lon = Math.atan2(posY, posX) * (180 / Math.PI);
            const lonDir = lon >= 0 ? 'E' : 'W';
            const lonAbs = Math.abs(lon);

            clickMessage.textContent = `Selected point - Latitude: ${lat.toFixed(2)}°, Longitude: ${lonDir} ${lonAbs.toFixed(2)}°`;
        } else {
            // Clicked outside sphere
            clickedPosition.set(-2, -2, -2);
            console.log('Clicked outside sphere');
            clickMessage.textContent = initClickMessage;
        }
    });

    // === Animation loop ===
    function animate() {
        requestAnimationFrame(animate);
        controls.update();

        // Update tick marks to face camera
        for (const { line, pos, axis } of tickData) {
            const toCamera = new THREE.Vector3().subVectors(camera.position, pos).normalize();
            // Perpendicular to both axis and camera direction
            const perp = new THREE.Vector3().crossVectors(axis, toCamera).normalize().multiplyScalar(tickSize);
            const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
            posAttr.setXYZ(0, pos.x + perp.x, pos.y + perp.y, pos.z + perp.z);
            posAttr.setXYZ(1, pos.x - perp.x, pos.y - perp.y, pos.z - perp.z);
            posAttr.needsUpdate = true;
        }

        renderer.render(scene, camera);
    }
    animate();
});
