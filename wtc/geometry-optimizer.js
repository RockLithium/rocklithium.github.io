// Exact, conservative coalescing for opaque slab and profile OBB primitives.
// Coordinates stay as JavaScript Numbers; quantization is used only for keys.
const COORDINATE_TOLERANCE = 1e-7;
const ROTATION_TOLERANCE = 1e-12;
const SLAB_KIND = /(?:slab|suspended\s+ceiling|gallery\s+floor)/i;
// These profiles contain collinear runs or redundant overlapping members.
// Only equal cross-sections AND equal rotations can coalesce; curved runs
// with different tangents remain separate. Never merge glazing interfaces.
const PROFILE_KINDS = new Set([
  'curved trident aluminum face',
  'curved trident aluminum edge',
  'curved trident aluminum washer slot lip',
  'core grid beam', 'core longitudinal beam', 'shaft opening edge beam',
  'core grid beam web', 'core grid beam flange',
  'core longitudinal beam web', 'core longitudinal beam flange',
  'shaft opening edge beam web', 'shaft opening edge beam flange',
  'upper pointed window arch',
]);

const objectIds = new WeakMap();
const symbolIds = new Map();
let nextObjectId = 1;

function scalarKey(value) {
  if (value === undefined) return 'u';
  if (value === null) return 'null';
  if (typeof value === 'number') return `n:${Object.is(value, -0) ? '0' : String(value)}`;
  if (typeof value === 'string') return `s:${value.length}:${value}`;
  if (typeof value === 'boolean') return value ? 'b:1' : 'b:0';
  if (typeof value === 'bigint') return `i:${value}`;
  if (typeof value === 'symbol') {
    let id = symbolIds.get(value);
    if (!id) { id = nextObjectId++; symbolIds.set(value, id); }
    return `y:${id}`;
  }
  let id = objectIds.get(value);
  if (!id) { id = nextObjectId++; objectIds.set(value, id); }
  return `o:${id}`;
}

function quaternionOf(primitive) {
  const source = primitive.rotation ?? [0, 0, 0, 1];
  if (!source || source.length !== 4) return null;
  const q = Array.from(source, Number);
  if (!q.every(Number.isFinite)) return null;
  const length = Math.hypot(...q);
  if (!(length > 0)) return null;
  for (let i = 0; i < 4; i++) q[i] /= length;

  // q and -q represent the same rotation. Pick one stable hemisphere,
  // including the 180-degree case where w is zero.
  let sign = 1;
  for (let i = 3; i >= 0; i--) {
    if (Math.abs(q[i]) > ROTATION_TOLERANCE) { sign = q[i] < 0 ? -1 : 1; break; }
  }
  if (sign < 0) for (let i = 0; i < 4; i++) q[i] = -q[i];
  for (let i = 0; i < 4; i++) if (Math.abs(q[i]) < ROTATION_TOLERANCE / 2) q[i] = 0;
  return q;
}

function rotationKey(q) {
  return q.map(value => Math.round(value / ROTATION_TOLERANCE)).join(',');
}

function rotate(vector, q, inverse = false) {
  const sign = inverse ? -1 : 1;
  const x = q[0] * sign, y = q[1] * sign, z = q[2] * sign, w = q[3];
  const tx = 2 * (y * vector[2] - z * vector[1]);
  const ty = 2 * (z * vector[0] - x * vector[2]);
  const tz = 2 * (x * vector[1] - y * vector[0]);
  return [
    vector[0] + w * tx + y * tz - z * ty,
    vector[1] + w * ty + z * tx - x * tz,
    vector[2] + w * tz + x * ty - y * tx,
  ];
}

function isEligible(primitive, profileMerging) {
  if (!primitive || !(SLAB_KIND.test(String(primitive.kind || '')) || (profileMerging && PROFILE_KINDS.has(primitive.kind))) || /convex/i.test(String(primitive.kind || ''))) return false;
  if (primitive.convex || primitive.convexShape || primitive.vertices || primitive.points || primitive.faces) return false;
  if (primitive.shape && primitive.shape !== 'box' && primitive.shape !== 'obb') return false;
  if (!primitive.center || primitive.center.length !== 3 || !primitive.half || primitive.half.length !== 3) return false;
  if (!Array.from(primitive.center).every(Number.isFinite)) return false;
  if (!Array.from(primitive.half).every(value => Number.isFinite(value) && value > 0)) return false;
  return !!quaternionOf(primitive);
}

function memberCount(primitive) {
  return Number.isSafeInteger(primitive.mergedMembers) && primitive.mergedMembers > 0 ? primitive.mergedMembers : 1;
}

function bucketAt(root, cells, create = false) {
  let map = root;
  for (let axis = 0; axis < cells.length - 1; axis++) {
    let next = map.get(cells[axis]);
    if (!next && create) { next = new Map(); map.set(cells[axis], next); }
    if (!next) return null;
    map = next;
  }
  return { map, cell: cells[cells.length - 1] };
}

function sameCrossSection(values, group) {
  return values.every((value, index) => Math.abs(value - group.crossValues[index]) <= COORDINATE_TOLERANCE);
}

function mergeAxis(primitives, axis, profileMerging) {
  const perpendicular = [0, 1, 2].filter(value => value !== axis);
  const baseGroups = new Map();
  const groups = [];

  // Only explicitly supported candidates pay grouping/key allocation. The rest
  // of a large scene stays in the result untouched.
  for (let index = 0; index < primitives.length; index++) {
    const primitive = primitives[index];
    if (!isEligible(primitive, profileMerging)) continue;
    const q = quaternionOf(primitive);
    const localCenter = rotate(primitive.center, q, true);
    const half = Array.from(primitive.half);
    const semanticKey = [primitive.material, primitive.layer, primitive.tower, primitive.floor, primitive.kind, primitive.source]
      .map(scalarKey).join('|');
    const crossValues = [half[perpendicular[0]], half[perpendicular[1]], localCenter[perpendicular[0]], localCenter[perpendicular[1]]];
    const key = `${semanticKey}|${rotationKey(q)}|${axis}`;
    let root = baseGroups.get(key);
    if (!root) { root = new Map(); baseGroups.set(key, root); }
    const cells = crossValues.map(value => Math.floor(value / COORDINATE_TOLERANCE));
    const exact = bucketAt(root, cells);
    let group = exact?.map.get(exact.cell);
    if (!group || !sameCrossSection(crossValues, group)) {
      group = null;
      // Exact-cell lookup handles the common case. Probe adjacent cells only
      // for values that straddle a quantization boundary due to float noise.
      for (let a = -1; a <= 1 && !group; a++) for (let b = -1; b <= 1 && !group; b++)
        for (let c = -1; c <= 1 && !group; c++) for (let d = -1; d <= 1 && !group; d++) {
          if (a === 0 && b === 0 && c === 0 && d === 0) continue;
          const bucket = bucketAt(root, [cells[0] + a, cells[1] + b, cells[2] + c, cells[3] + d]);
          const candidate = bucket?.map.get(bucket.cell);
          if (candidate && sameCrossSection(crossValues, candidate)) group = candidate;
        }
    }
    if (!group) {
      group = { q, anchorCenter: localCenter, anchorHalf: half, crossValues, entries: [] };
      const bucket = bucketAt(root, cells, true);
      bucket.map.set(bucket.cell, group);
      groups.push(group);
    }
    const lo = localCenter[axis] - half[axis], hi = localCenter[axis] + half[axis];
    group.entries.push({ index, primitive, q, localCenter, half, lo, hi });
  }

  if (!groups.length) return primitives;
  const replacements = new Map();
  const removed = new Set();
  let changed = false;

  for (const group of groups) {
    if (group.entries.length < 2) continue;
    group.entries.sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.index - b.index);
    let component = [];
    let lo = 0, hi = 0;
    const finish = () => {
      if (component.length < 2) { component = []; return; }
      const representative = component.reduce((first, entry) => entry.index < first.index ? entry : first);
      const mergedCenter = group.anchorCenter.slice();
      mergedCenter[axis] = (lo + hi) / 2;
      const mergedHalf = group.anchorHalf.slice();
      mergedHalf[axis] = (hi - lo) / 2;
      const merged = {
        ...representative.primitive,
        center: rotate(mergedCenter, representative.q),
        half: mergedHalf,
        mergedMembers: component.reduce((sum, entry) => sum + memberCount(entry.primitive), 0),
      };
      replacements.set(representative.index, merged);
      for (const entry of component) if (entry.index !== representative.index) removed.add(entry.index);
      changed = true;
      component = [];
    };

    for (const entry of group.entries) {
      if (!component.length) { component = [entry]; lo = entry.lo; hi = entry.hi; continue; }
      if (entry.lo <= hi + COORDINATE_TOLERANCE) {
        component.push(entry);
        hi = Math.max(hi, entry.hi);
      } else {
        finish();
        component = [entry]; lo = entry.lo; hi = entry.hi;
      }
    }
    finish();
  }

  if (!changed) return primitives;
  const output = [];
  for (let index = 0; index < primitives.length; index++) {
    if (removed.has(index)) continue;
    output.push(replacements.get(index) || primitives[index]);
  }
  return output;
}

/** Merge exact contiguous/overlapping OBB unions without changing profile tangents. */
export function optimizePrimitives(primitives, {profileMerging = true} = {}) {
  if (!Array.isArray(primitives)) throw new TypeError('primitives must be an array');
  const before = primitives.length;
  let optimized = primitives;
  for (let round = 0; round < 3; round++) {
    const beforeRound = optimized.length;
    for (let axis = 0; axis < 3; axis++) optimized = mergeAxis(optimized, axis, profileMerging);
    if (optimized.length === beforeRound) break;
  }
  return { primitives: optimized, stats: { before, after: optimized.length, merged: before - optimized.length } };
}
