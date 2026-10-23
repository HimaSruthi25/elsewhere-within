function Toggle({ label, on, onToggle }) {
  return (
    <button
      type="button"
      className="control"
      aria-pressed={on}
      onClick={onToggle}
    >
      {label} <span className="control__state">{on ? 'On' : 'Off'}</span>
    </button>
  )
}

function Controls({ soundOn, motionOn, onToggleSound, onToggleMotion }) {
  return (
    <nav className="controls" aria-label="Experience settings">
      <Toggle label="Sound" on={soundOn} onToggle={onToggleSound} />
      <Toggle label="Motion" on={motionOn} onToggle={onToggleMotion} />
    </nav>
  )
}

export default Controls
