import * as faceapi from "face-api.js";

let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
  })();
  return loadingPromise;
}

export async function getFaceDescriptor(input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<Float32Array | null> {
  await loadFaceModels();
  const detection = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return detection?.descriptor || null;
}

export function descriptorToArray(d: Float32Array): number[] {
  return Array.from(d);
}

export function arrayToDescriptor(a: number[]): Float32Array {
  return Float32Array.from(a);
}

export function euclideanDistance(a: Float32Array | number[], b: Float32Array | number[]): number {
  const arrA = a instanceof Float32Array ? a : Float32Array.from(a);
  const arrB = b instanceof Float32Array ? b : Float32Array.from(b);
  let sum = 0;
  for (let i = 0; i < arrA.length; i++) sum += (arrA[i] - arrB[i]) ** 2;
  return Math.sqrt(sum);
}
