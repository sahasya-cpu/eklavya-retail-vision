/**
 * Lightweight, dependency-free multi-object tracker for on-device shopper
 * analytics. Takes per-frame person detections (bounding boxes already
 * produced by a TensorFlow.js detection model running in the browser) and
 * maintains persistent tracks across frames using nearest-centroid
 * matching — the standard, well-understood approach for tracking a
 * handful of simultaneously visible people without needing a heavier
 * dedicated tracking library.
 *
 * Privacy boundary: this module only ever works with numeric coordinates
 * (bounding box positions). It never touches, stores, or has access to
 * the underlying image/video pixels — those never leave the detection
 * model's own pass over the video element.
 */

const MAX_MATCH_DISTANCE = 120; // px — how far a centroid may move between frames and still count as the same person
const MAX_FRAMES_LOST = 8; // frames of not being seen before a track is considered gone (~2s at the 4fps detection rate used here)

let nextTrackId = 1;

export function createTracker() {
  return { tracks: new Map() };
}

export function resetTrackIdCounter() {
  nextTrackId = 1;
}

function centroidOf(bbox) {
  const [x, y, width, height] = bbox;
  return { x: x + width / 2, y: y + height / 2 };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Advances the tracker by one detection frame.
 * @param tracker - object from createTracker()
 * @param detections - array of { bbox: [x, y, width, height], score }
 * @returns { activeTracks, endedTracks } — endedTracks are tracks lost this
 *   frame; the caller should finalize any open zone/dwell state on them
 *   before they're discarded.
 */
export function updateTracker(tracker, detections) {
  const centroids = detections.map((d) => centroidOf(d.bbox));
  const unmatchedTrackIds = new Set(tracker.tracks.keys());
  const unmatchedDetectionIdx = new Set(centroids.map((_, i) => i));

  // Greedy nearest-neighbor matching: gather every (track, detection) pair
  // within the distance threshold, then assign the closest pairs first.
  const candidatePairs = [];
  for (const [id, track] of tracker.tracks) {
    centroids.forEach((c, i) => {
      const d = distance(track.centroid, c);
      if (d <= MAX_MATCH_DISTANCE) candidatePairs.push({ id, i, d });
    });
  }
  candidatePairs.sort((a, b) => a.d - b.d);

  for (const { id, i } of candidatePairs) {
    if (!unmatchedTrackIds.has(id) || !unmatchedDetectionIdx.has(i)) continue;
    const track = tracker.tracks.get(id);
    track.centroid = centroids[i];
    track.framesSinceSeen = 0;
    unmatchedTrackIds.delete(id);
    unmatchedDetectionIdx.delete(i);
  }

  // Unmatched detections become new tracks.
  for (const i of unmatchedDetectionIdx) {
    const id = nextTrackId++;
    tracker.tracks.set(id, {
      id,
      centroid: centroids[i],
      framesSinceSeen: 0,
      zoneState: {}, // zoneId -> { since: timestamp } for currently-occupied dwell zones
      lineSide: null, // which side of the entrance line this track was last seen on
    });
  }

  // Age out tracks not seen this frame; report ones that finally expire.
  const endedTracks = [];
  for (const id of unmatchedTrackIds) {
    const track = tracker.tracks.get(id);
    track.framesSinceSeen += 1;
    if (track.framesSinceSeen > MAX_FRAMES_LOST) {
      tracker.tracks.delete(id);
      endedTracks.push(track);
    }
  }

  return { activeTracks: [...tracker.tracks.values()], endedTracks };
}

/** Point-in-rectangle test. rect = { x, y, width, height } in the same coordinate space as centroids (pixels). */
export function isInsideZone(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * Detects whether a track crossed the entrance line this frame.
 * Convention: moving from above the line to below it = ENTRY (walking
 * further into the store / toward the camera); the reverse = EXIT.
 * Returns null if there's no line to report (first sighting of this track,
 * or no crossing happened).
 */
export function checkLineCrossing(track, lineY) {
  const side = track.centroid.y < lineY ? 'above' : 'below';
  if (track.lineSide === null) {
    track.lineSide = side;
    return null;
  }
  if (track.lineSide !== side) {
    const crossing = side === 'below' ? 'ENTRY' : 'EXIT';
    track.lineSide = side;
    return crossing;
  }
  return null;
}

/** Buckets a pixel-space point into a coarse grid cell for anonymous heatmap accumulation. */
export function toGridCell(point, frameWidth, frameHeight, gridCols = 12, gridRows = 8) {
  const gx = Math.min(gridCols - 1, Math.floor((point.x / frameWidth) * gridCols));
  const gy = Math.min(gridRows - 1, Math.floor((point.y / frameHeight) * gridRows));
  return { gx, gy };
}
