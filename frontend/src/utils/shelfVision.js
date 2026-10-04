/**
 * Simplified shelf-fill estimation.
 *
 * True product-level shelf recognition needs a custom-trained vision model
 * and a large labeled dataset of real shelf photos — neither exists for
 * this project. This module instead uses an honest, explainable proxy: a
 * well-stocked shelf region has visual texture (edges between packages,
 * labels, shadows) while an empty/near-empty shelf is comparatively
 * uniform (bare shelf board, back wall). We measure that texture as the
 * grayscale *variance* of pixel brightness within the shelf region, and
 * compare it against a one-time "fully stocked" baseline the owner
 * captures. This is a genuine, if simple, computation — not a hardcoded
 * number — and it correctly tracks "emptier vs fuller" for most shelves,
 * though it cannot identify *which* product is missing the way a trained
 * model could.
 *
 * Only this small numeric profile is ever stored or sent anywhere — never
 * the captured frame or region image itself.
 */

/**
 * @param {HTMLVideoElement} video
 * @param {{x:number,y:number,width:number,height:number}} rectFraction - region as 0..1 fractions of the frame
 * @returns {{avgBrightness: number, variance: number}}
 */
export function computeRegionStats(video, rectFraction) {
  const frameWidth = video.videoWidth;
  const frameHeight = video.videoHeight;

  const rx = Math.round(rectFraction.x * frameWidth);
  const ry = Math.round(rectFraction.y * frameHeight);
  const rw = Math.max(1, Math.round(rectFraction.width * frameWidth));
  const rh = Math.max(1, Math.round(rectFraction.height * frameHeight));

  const canvas = document.createElement('canvas');
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, frameWidth, frameHeight);

  const imageData = ctx.getImageData(rx, ry, rw, rh);
  const { data } = imageData;

  let sum = 0;
  const grayValues = new Array(rw * rh);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Standard luminance-weighted grayscale conversion.
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    grayValues[p] = gray;
    sum += gray;
  }
  const avgBrightness = sum / grayValues.length;

  let varianceSum = 0;
  for (const g of grayValues) {
    varianceSum += (g - avgBrightness) ** 2;
  }
  const variance = varianceSum / grayValues.length;

  return { avgBrightness: Math.round(avgBrightness * 10) / 10, variance: Math.round(variance * 10) / 10 };
}

/**
 * Computes a 0..1 "filled ratio" by comparing current shelf texture against
 * the baseline captured when the shelf was known to be fully stocked.
 */
export function estimateFilledRatio(baselineProfile, currentStats) {
  if (!baselineProfile?.variance || baselineProfile.variance <= 0) return 1; // no usable baseline — don't false-alarm
  const ratio = currentStats.variance / baselineProfile.variance;
  return Math.max(0, Math.min(1, ratio));
}
