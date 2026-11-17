import { useUI } from '../store/useUI'
import Icon from './Icon'

export default function Toast() {
  const msg = useUI((s) => s.toastMsg)
  const action = useUI((s) => s.toastAction)
  const dismissToast = useUI((s) => s.dismissToast)
  const runToastAction = useUI((s) => s.runToastAction)

  if (!msg) return null

  return (
    <div id="toast" role="status" className={'show' + (action ? ' has-action' : '')}>
      <button type="button" className="toast-x" aria-label="Dismiss" onClick={dismissToast}>
        <Icon name="xmark" />
      </button>
      <span className="toast-msg">{msg}</span>
      {action && (
        <button type="button" className="toast-act" onClick={runToastAction}>
          <Icon name="undo" />
          <span>{action.label}</span>
        </button>
      )}
    </div>
  )
}
