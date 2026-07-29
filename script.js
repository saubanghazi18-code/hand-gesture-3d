// ======================
// THREE.JS SETUP
// ======================
const container = document.getElementById('three-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0x404040, 1.8);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);

// ======================
// OBJECTS & DRAWING
// ======================
const objects = [];
let selectedObject = null;

// Drawing system
const drawingPoints = [];          // stores current stroke points
let isDrawing = false;
const strokes = [];                // finished strokes (so they stay)
const maxStrokePoints = 300;       // limit points per stroke for performance

// Create a glowing line material
const lineMaterial = new THREE.LineBasicMaterial({
  color: 0x00f2fe,
  linewidth: 3,
  transparent: true,
  opacity: 0.95
});

// Helper: create a new stroke line
function createStroke(points) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, lineMaterial.clone());
  scene.add(line);
  strokes.push(line);
  return line;
}

// Spawn cube
function createCube() {
  const geometry = new THREE.BoxGeometry(0.55, 0.55, 0.55);
  const material = new THREE.MeshStandardMaterial({
    color: 0x00f2fe,
    emissive: 0x003344,
    metalness: 0.75,
    roughness: 0.2
  });
  const cube = new THREE.Mesh(geometry, material);
  cube.position.set(
    (Math.random() - 0.5) * 4,
    (Math.random() - 0.5) * 2.5,
    (Math.random() - 0.5) * 2
  );
  scene.add(cube);
  objects.push(cube);
  return cube;
}

// Start with one cube
createCube();

// ======================
// HAND TRACKING
// ======================
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output');
const canvasCtx = canvasElement.getContext('2d');
const statusEl = document.getElementById('status');

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.6
});

hands.onResults(onResults);

const cameraUtils = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({ image: videoElement });
  },
  width: 640,
  height: 480
});
cameraUtils.start();

// Convert hand coords → Three.js world
function handToWorld(x, y, z = 0) {
  const worldX = (0.5 - x) * 9;   // mirrored
  const worldY = (0.5 - y) * 6.5;
  const worldZ = z * 3;
  return new THREE.Vector3(worldX, worldY, worldZ);
}

// Gesture helpers
function isPinch(landmarks) {
  const thumb = landmarks[4];
  const index = landmarks[8];
  const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
  return dist < 0.045;
}

function isOpenHand(landmarks) {
  return (
    landmarks[8].y < landmarks[6].y &&
    landmarks[12].y < landmarks[10].y &&
    landmarks[16].y < landmarks[14].y &&
    landmarks[20].y < landmarks[18].y
  );
}

function isFist(landmarks) {
  // All fingertips lower than their base
  return (
    landmarks[8].y > landmarks[6].y &&
    landmarks[12].y > landmarks[10].y &&
    landmarks[16].y > landmarks[14].y &&
    landmarks[20].y > landmarks[18].y
  );
}

let lastSpawnTime = 0;
let lastClearTime = 0;

function onResults(results) {
  // Draw landmarks on small preview
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];

    drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF9D', lineWidth: 2 });
    drawLandmarks(canvasCtx, landmarks, { color: '#00F2FE', lineWidth: 1, radius: 3 });

    const indexTip = landmarks[8];
    const worldPos = handToWorld(indexTip.x, indexTip.y);

    const pinching = isPinch(landmarks);
    const open = isOpenHand(landmarks);
    const fist = isFist(landmarks);

    // ========== DRAWING LOGIC ==========
    // When not pinching and not fist → draw with index finger
    if (!pinching && !fist) {
      if (!isDrawing) {
        isDrawing = true;
        drawingPoints.length = 0; // start new stroke
      }

      // Add point if moved enough (prevents too many points)
      if (drawingPoints.length === 0 || 
          drawingPoints[drawingPoints.length - 1].distanceTo(worldPos) > 0.04) {
        drawingPoints.push(worldPos.clone());

        // Keep stroke length reasonable
        if (drawingPoints.length > maxStrokePoints) {
          drawingPoints.shift();
        }
      }

      // Update or create temporary line for current stroke
      if (drawingPoints.length > 1) {
        // Remove previous temporary line if exists
        if (window.tempLine) {
          scene.remove(window.tempLine);
        }
        const geo = new THREE.BufferGeometry().setFromPoints(drawingPoints);
        window.tempLine = new THREE.Line(geo, lineMaterial);
        scene.add(window.tempLine);
      }

      statusEl.textContent = "✍️ Writing...";
    } else {
      // Finish the current stroke
      if (isDrawing && drawingPoints.length > 2) {
        createStroke([...drawingPoints]);
        if (window.tempLine) {
          scene.remove(window.tempLine);
          window.tempLine = null;
        }
      }
      isDrawing = false;
      drawingPoints.length = 0;
    }

    // ========== CLEAR DRAWING (Fist) ==========
    if (fist && Date.now() - lastClearTime > 1200) {
      // Remove all strokes
      strokes.forEach(s => scene.remove(s));
      strokes.length = 0;
      if (window.tempLine) {
        scene.remove(window.tempLine);
        window.tempLine = null;
      }
      lastClearTime = Date.now();
      statusEl.textContent = "Drawing cleared!";
    }

    // ========== SPAWN CUBE (Open hand) ==========
    if (open && !pinching && Date.now() - lastSpawnTime > 1600) {
      createCube();
      lastSpawnTime = Date.now();
      statusEl.textContent = "Spawned new cube!";
    }

    // ========== GRAB OBJECTS (Pinch) ==========
    if (pinching) {
      if (!selectedObject) {
        let minDist = Infinity;
        objects.forEach(obj => {
          const dist = obj.position.distanceTo(worldPos);
          if (dist < 1.3 && dist < minDist) {
            minDist = dist;
            selectedObject = obj;
          }
        });
      }

      if (selectedObject) {
        selectedObject.position.lerp(worldPos, 0.35);
        selectedObject.rotation.x += 0.04;
        selectedObject.rotation.y += 0.06;
        statusEl.textContent = "Grabbing object...";
      }
    } else {
      selectedObject = null;
    }

  } else {
    statusEl.textContent = "Show your hand to the camera";
    isDrawing = false;
  }

  canvasCtx.restore();
}

// ======================
// ANIMATION LOOP
// ======================
function animate() {
  requestAnimationFrame(animate);

  objects.forEach((obj, i) => {
    if (obj !== selectedObject) {
      obj.rotation.x += 0.004;
      obj.rotation.y += 0.006;
      obj.position.y += Math.sin(Date.now() * 0.001 + i) * 0.0015;
    }
  });

  renderer.render(scene, camera);
}
animate();

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
