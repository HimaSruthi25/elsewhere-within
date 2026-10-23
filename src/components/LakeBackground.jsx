import { useRef } from 'react'
import WaterCanvas from './WaterCanvas.jsx'
import { objectPosition } from '../water/lakeGeometry.js'

// The photo is 5:4, so on screens taller than 5:4 it must be scaled to the
// viewport height (125vh wide) to cover; otherwise it spans the width.
const SIZES = '(max-aspect-ratio: 5/4) 125vh, 100vw'

function LakeBackground({ motionOn, getWaterSignal, driveOptions }) {
  const imageRef = useRef(null)

  return (
    <div className="lake" aria-hidden="true">
      <img
        ref={imageRef}
        className="lake__photo"
        src="/assets/lake-1920.jpg"
        srcSet="/assets/lake-1280.jpg 1280w, /assets/lake-1920.jpg 1920w, /assets/lake-2560.jpg 2560w"
        sizes={SIZES}
        alt=""
        decoding="async"
        fetchPriority="high"
        style={{ objectPosition }}
      />
      <WaterCanvas imageRef={imageRef} active={motionOn} getSignal={getWaterSignal} driveOptions={driveOptions} />
    </div>
  )
}

export default LakeBackground
