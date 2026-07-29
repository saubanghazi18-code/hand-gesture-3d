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
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);

// Objects array
const objects = [];
let selectedObject = null;
let isPinching = false;

// Create a glowing cube
function createCube() {
  const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const material = new THREE.MeshStandardMaterial({
    color: 0x00f2fe,
    emissive: 0x003344,
    metalness: 0.7,
    roughness: 0.2
  });
  const cube = new THREE.Mesh(geometry, material);
  cube.position.set(
    (Math.random() - 0.5) * 4,
    (Math.random() - 0.5) * 3,
    (Math.random() - 0.5) * 2
  );
  scene.add(cube);
  objects.push(cube);
  return cube;
}

// Spawn one cube at start
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

// Convert normalized hand coords → Three.js world coords
function handToWorld(x, y, z = 0) {
  // Mirror X because we mirrored the video
  const worldX = (0.5 - x) * 8;
  const worldY = (0.5 - y) * 6;
  const worldZ = z * 4;
  return new THREE.Vector3(worldX, worldY, worldZ);
}

// Detect pinch (thumb tip + index tip close)
function isPinch(landmarks) {
  const thumb = landmarks[4];
  const index = landmarks[8];
  const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
  return dist < 0.05;
}

// Detect open hand (fingers extended)
function isOpenHand(landmarks) {
  // Simple check: tip of fingers higher than base
  return (
    landmarks[8].y < landmarks[6].y &&
    landmarks[12].y < landmarks[10].y &&
    landmarks[16].y < landmarks[14].y
  );
}

let lastSpawnTime = 0;

function onResults(results) {
  // Draw hand landmarks on small canvas
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];
    
    // Draw connections
    drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF9D', lineWidth: 2 });
    drawLandmarks(canvasCtx, landmarks, { color: '#00F2FE', lineWidth: 1, radius: 3 });

    const indexTip = landmarks[8];
    const palm = landmarks[9]; // roughly center of palm

    const worldPos = handToWorld(indexTip.x, indexTip.y);

    // === GESTURES ===
    const pinching = isPinch(landmarks);
    const open = isOpenHand(landmarks);

    // Spawn cube when open hand (with cooldown)
    if (open && !pinching && Date.now() - lastSpawnTime > 1500) {
      createCube();
      lastSpawnTime = Date.now();
      statusEl.textContent = "Spawned new cube!";
    }

    // Grab logic
    if (pinching) {
      if (!selectedObject) {
        // Find closest object
        let minDist = Infinity;
        objects.forEach(obj => {
          const dist = obj.position.distanceTo(worldPos);
          if (dist < 1.2 && dist < minDist) {
            minDist = dist;
            selectedObject = obj;
          }
        });
      }

      if (selectedObject) {
        selectedObject.position.lerp(worldPos, 0.3);
        selectedObject.rotation.x += 0.05;
        selectedObject.rotation.y += 0.07;
        statusEl.textContent = "Grabbing object...";
      }
    } else {
      selectedObject = null;
      statusEl.textContent = "Tracking hand • Open hand to spawn • Pinch to grab";
    }
  } else {
    statusEl.textContent = "No hand detected";
  }

  canvasCtx.restore();
}

// ======================
// ANIMATION LOOP
// ======================
function animate() {
  requestAnimationFrame(animate);

  // Gentle floating animation for non-selected objects
  objects.forEach((obj, i) => {
    if (obj !== selectedObject) {
      obj.rotation.x += 0.005;
      obj.rotation.y += 0.008;
      obj.position.y += Math.sin(Date.now() * 0.001 + i) * 0.002;
    }
  });

  renderer.render(scene, camera);
}
animate();

// Handle resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
