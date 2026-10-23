// Geometry of the lake photograph, shared by the CSS still image and the
// water shader so both crop the photo identically.

// Reference size the shoreline was measured on (lake-2560.jpg). All the
// served copies share its 5:4 aspect ratio.
export const PHOTO_SIZE = { width: 2560, height: 2048 }
export const PHOTO_ASPECT = PHOTO_SIZE.width / PHOTO_SIZE.height

// Crop anchor, as CSS object-position fractions. The horizon sits at ~50.6%
// of the photo, so this keeps it centred on any screen shape.
export const PHOTO_FOCUS = { x: 0.5, y: 0.506 }

// Water's edge, traced on the photo at 4x zoom. Everything below this line
// is water; everything above (sky, hills, trees, rocks, islet) stays still.
// [x, y] in reference pixels, sorted by x.
const SHORELINE_PX = [
  [0, 1056], // rocky shore, left
  [200, 1053],
  [425, 1050],
  [518, 1047], // tip of the rocks
  [524, 1039], // open water behind the rocks
  [640, 1037],
  [915, 1036],
  [935, 1034], // foot of the distant hills
  [1920, 1034],
  [2378, 1035], // right forest
  [2388, 1043], // rock islet
  [2450, 1045], // headland, right
  [2560, 1045],
]

// Shoreline in image UV (0..1, origin top-left).
export const SHORELINE = SHORELINE_PX.map(([x, y]) => [x / PHOTO_SIZE.width, y / PHOTO_SIZE.height])

// The water plane's vanishing line: a straight horizon just above the
// highest point of the shoreline. Perspective is measured from this, not
// from the jagged shoreline, so steps in the shore can't cause seams.
export const HORIZON = (Math.min(...SHORELINE_PX.map(([, y]) => y)) - 1) / PHOTO_SIZE.height

// Shoreline height at image u, matching the shader's interpolation.
export function shorelineAt(u) {
  let y = SHORELINE[0][1]
  for (let i = 0; i < SHORELINE.length - 1; i++) {
    const [ax, ay] = SHORELINE[i]
    const [bx, by] = SHORELINE[i + 1]
    if (u >= ax) y = ay + (by - ay) * Math.min(1, Math.max(0, (u - ax) / Math.max(bx - ax, 1e-5)))
  }
  return y
}

// The CSS object-fit: cover crop, expressed as a transform from screen UV
// (0..1 across the viewport, origin top-left) to image UV:
//   imageUv = screenUv * scale + offset
export function coverTransform(viewWidth, viewHeight, aspect = PHOTO_ASPECT, focus = PHOTO_FOCUS) {
  const scale = Math.max(viewWidth / aspect, viewHeight) // displayed image height
  const shownWidth = scale * aspect
  const shownHeight = scale
  const left = (viewWidth - shownWidth) * focus.x
  const top = (viewHeight - shownHeight) * focus.y
  return {
    scale: [viewWidth / shownWidth, viewHeight / shownHeight],
    offset: [-left / shownWidth, -top / shownHeight],
  }
}

// Part of the visible water a ring may start in, as fractions: away from the
// screen's side edges, and between the far water (small rings near the
// shore) and the near water (large rings), never right at the shoreline or
// the bottom edge where most of the ring would be cut off.
export const RIPPLE_AREA = { across: [0.15, 0.85], down: [0.25, 0.65] }

// Converts a ring's spot ([across, down], each 0..1, from breathDrive) to
// a point on the water plane, inside the water visible on this screen and
// below the real shoreline at that point.
export function rippleOriginAt({ scale, offset }, [across, down]) {
  const lerp = ([a, b], t) => a + (b - a) * Math.min(1, Math.max(0, t))
  const u = offset[0] + scale[0] * lerp(RIPPLE_AREA.across, across)
  const top = Math.max(shorelineAt(u), offset[1])
  const bottom = offset[1] + scale[1]
  const v = top + (bottom - top) * lerp(RIPPLE_AREA.down, down)
  const z = 1 / Math.max(v - HORIZON, 1e-3)
  return [(u - 0.5) * PHOTO_ASPECT * z, z]
}

// Strength factor for a ring starting at spot. The shader turns surface
// slope into image displacement in proportion to depth below the horizon,
// so a ring nearer the viewer would move the photo further than one at the
// centre spot (where the strength was tuned). This evens out the peak
// displacement: factor * depth is the same for every spot.
export function rippleStrengthAt(transform, spot) {
  const [, zCentre] = rippleOriginAt(transform, [0.5, 0.5])
  const [, z] = rippleOriginAt(transform, spot)
  return z / zCentre
}

// Inverse of the plane mapping: image UV of a water-plane point.
export function planeToImageUv([x, z]) {
  return [0.5 + x / (PHOTO_ASPECT * z), HORIZON + 1 / z]
}

export const objectPosition =`${PHOTO_FOCUS.x * 100}% ${PHOTO_FOCUS.y * 100}%`
