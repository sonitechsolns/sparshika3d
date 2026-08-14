import * as THREE from 'three';

/**
 * Compute the local-space axis a fan should spin about: the normal of the
 * blade disc, i.e. the direction of least geometric extent across all of the
 * object's descendant mesh geometry, measured in `obj`'s own local frame.
 *
 * Computing this from the *live* three.js scene (rather than assuming X/Y/Z)
 * makes fan rotation correct no matter how the GLB was authored, exported, or
 * converted on import — which is exactly where the earlier hard-coded `rotateZ`
 * went wrong.
 *
 * Uses a covariance/PCA fit so it stays correct even if the disc is tilted
 * relative to the object's local axes (a plain bounding box would not).
 *
 * @param {THREE.Object3D} obj
 * @returns {THREE.Vector3} unit axis in obj-local space
 */
export function computeLocalSpinAxis(obj) {
  obj.updateWorldMatrix(true, true);
  const toLocal = new THREE.Matrix4().copy(obj.matrixWorld).invert();

  // First pass: centroid of all descendant vertices in obj-local space.
  const v = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  let n = 0;
  const meshes = [];
  obj.traverse((c) => {
    if (c.isMesh && c.geometry && c.geometry.attributes.position) {
      c.updateWorldMatrix(true, false);
      const m = new THREE.Matrix4().multiplyMatrices(toLocal, c.matrixWorld);
      meshes.push({ pos: c.geometry.attributes.position, m });
    }
  });
  for (const { pos, m } of meshes) {
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      centroid.add(v);
      n++;
    }
  }
  if (n === 0) return new THREE.Vector3(0, 0, 1);
  centroid.multiplyScalar(1 / n);

  // Second pass: 3x3 covariance matrix (symmetric).
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const { pos, m } of meshes) {
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m).sub(centroid);
      xx += v.x * v.x; xy += v.x * v.y; xz += v.x * v.z;
      yy += v.y * v.y; yz += v.y * v.z; zz += v.z * v.z;
    }
  }

  // Smallest eigenvector = disc normal. Get it as the cross product of the two
  // dominant eigenvectors (found via power iteration + deflation), which is
  // numerically stable even when the disc is nearly flat.
  const C = [
    [xx, xy, xz],
    [xy, yy, yz],
    [xz, yz, zz],
  ];
  const mulC = (out, a) => {
    out.set(
      C[0][0] * a.x + C[0][1] * a.y + C[0][2] * a.z,
      C[1][0] * a.x + C[1][1] * a.y + C[1][2] * a.z,
      C[2][0] * a.x + C[2][1] * a.y + C[2][2] * a.z
    );
    return out;
  };
  const powerIter = (seed) => {
    const cur = seed.clone().normalize();
    const tmp = new THREE.Vector3();
    for (let k = 0; k < 40; k++) {
      mulC(tmp, cur);
      if (tmp.lengthSq() < 1e-20) break;
      tmp.normalize();
      if (tmp.dot(cur) < 0) tmp.negate();
      cur.copy(tmp);
    }
    return cur;
  };

  const e1 = powerIter(new THREE.Vector3(1, 0.3, 0.1));
  // Deflate C by removing the e1 component, then iterate again for e2.
  const lambda1 = mulC(new THREE.Vector3(), e1).dot(e1);
  for (let r = 0; r < 3; r++)
    for (let cc = 0; cc < 3; cc++)
      C[r][cc] -= lambda1 * e1.getComponent(r) * e1.getComponent(cc);
  // seed e2 orthogonal to e1
  let seed = new THREE.Vector3(0, 1, 0);
  if (Math.abs(seed.dot(e1)) > 0.9) seed.set(0, 0, 1);
  seed.sub(e1.clone().multiplyScalar(seed.dot(e1)));
  const e2 = powerIter(seed);

  const normal = new THREE.Vector3().crossVectors(e1, e2);
  if (normal.lengthSq() < 1e-12) return new THREE.Vector3(0, 0, 1);
  return normal.normalize();
}
