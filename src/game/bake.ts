// Merge a hierarchy of small static meshes into a few big ones, so a car or a pedestrian costs a
// handful of draw calls instead of dozens. Meshes whose material is in `paint` are merged into one
// vertex-coloured mesh; every other material keeps its own merged mesh.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const vcCache = new Map<string, THREE.MeshStandardMaterial>();
export function vcMaterial(roughness: number, metalness: number) {
  const k = `${roughness}-${metalness}`;
  let m = vcCache.get(k);
  if (!m) vcCache.set(k, (m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness })));
  return m;
}

function prep(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, color?: THREE.Color) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(matrix);
  for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv" && name !== "color") g.deleteAttribute(name);
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (color) {
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

/**
 * Replace the meshes under `root` (not crossing into `keep` children) by merged meshes.
 * Returns the new meshes, already added to root.
 */
export function bake(root: THREE.Object3D, paint: Set<THREE.Material>, vc: THREE.Material | null, keep: Set<THREE.Object3D> = new Set(), shadows = true): THREE.Mesh[] {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const victims: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (keep.has(c)) continue;
      if ((c as THREE.Mesh).isMesh && Array.isArray((c as THREE.Mesh).material) && (c as THREE.Mesh).geometry.groups.length) {
        // multi-material mesh (a box with facade sides and a roof top): split by group
        const mesh = c as THREE.Mesh;
        const mats = mesh.material as THREE.Material[];
        const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
        const flat = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
        for (const gr of mesh.geometry.groups) {
          const mat = mats[gr.materialIndex ?? 0];
          const sub = new THREE.BufferGeometry();
          for (const name of ["position", "normal", "uv"]) {
            const a = flat.attributes[name] as THREE.BufferAttribute | undefined;
            if (!a) continue;
            sub.setAttribute(name, new THREE.BufferAttribute((a.array as Float32Array).slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
          }
          const list = buckets.get(mat) ?? [];
          list.push(prep(sub, m));
          buckets.set(mat, list);
        }
        victims.push(mesh);
      } else if ((c as THREE.Mesh).isMesh && !Array.isArray((c as THREE.Mesh).material)) {
        const mesh = c as THREE.Mesh;
        const mat = mesh.material as THREE.Material;
        const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
        if (vc && paint.has(mat)) {
          const col = (mat as THREE.MeshStandardMaterial).color;
          const list = buckets.get(vc) ?? [];
          list.push(prep(mesh.geometry, m, col));
          buckets.set(vc, list);
        } else {
          const list = buckets.get(mat) ?? [];
          list.push(prep(mesh.geometry, m));
          buckets.set(mat, list);
        }
        victims.push(mesh);
      }
      walk(c);
    }
  };
  walk(root);
  for (const v of victims) v.parent?.remove(v);
  const out: THREE.Mesh[] = [];
  for (const [mat, list] of buckets) {
    const merged = mergeGeometries(list);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    root.add(mesh);
    out.push(mesh);
  }
  return out;
}
