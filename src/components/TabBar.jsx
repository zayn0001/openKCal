import Icon from './Icon'

function Tab({ active, icon, label, onClick, dot }) {
  return (
    <button
      type="button"
      className={active ? 'on' : ''}
      onClick={onClick}
      aria-label={label}
    >
      <span className="tab-ic">
        <Icon name={icon} />
        {dot && <span className="tab-dot" aria-hidden="true" />}
      </span>
      <span>{label}</span>
    </button>
  )
}

export default function TabBar({ currentTab, setTab, onQuickLog }) {
  return (
    <nav id="tabbar">
      <Tab
        active={currentTab === 'Diary'}
        icon="calendar"
        label="Diary"
        onClick={() => setTab('Diary')}
      />
      <Tab
        active={currentTab === 'Foods'}
        icon="utensils"
        label="Foods"
        onClick={() => setTab('Foods')}
      />

      {/* Signature openGym Center Floating Action Button */}
      <button
        type="button"
        className="start"
        onClick={onQuickLog}
        aria-label="Add food or calories"
      >
        <span className="cir">
          <Icon name="plus" />
        </span>
        <span>Log</span>
      </button>

      <Tab
        active={currentTab === 'Trends'}
        icon="chart"
        label="Trends"
        onClick={() => setTab('Trends')}
      />
      <Tab
        active={currentTab === 'Coach'}
        icon="chat"
        label="Coach"
        onClick={() => setTab('Coach')}
      />
    </nav>
  )
}
