import { forwardRef } from 'react'
import Icon from './Icon'
import { useUI } from '../store/useUI'

/* ============================ Buttons ============================ */
export function Button({ variant = 'plain', size, icon, trailingIcon, children, className = '', ...rest }) {
  return (
    <button className={`btn ${variant}${size ? ' ' + size : ''} ${className}`} {...rest}>
      {icon && <Icon name={icon} />}
      {children && <span>{children}</span>}
      {trailingIcon && <Icon name={trailingIcon} />}
    </button>
  )
}

/* ============================ Text & Inputs ============================ */
export const TextField = forwardRef(function TextField({ className = '', ...rest }, ref) {
  return <input ref={ref} className={'field ' + className} {...rest} />
})

export function TextArea({ className = '', ...rest }) {
  return <textarea className={'field area ' + className} {...rest} />
}

export const SearchField = forwardRef(function SearchField({ value, onChange, onClear, placeholder = 'Search…', className = '', ...rest }, ref) {
  return (
    <div className={'searchf ' + className}>
      <Icon name="magnifier" className="lead" />
      <input ref={ref} className="field" value={value} onChange={onChange} placeholder={placeholder} {...rest} />
      {!!value && (
        <button type="button" className="clear" onClick={onClear} aria-label="Clear">
          <Icon name="xmark" />
        </button>
      )}
    </div>
  )
})

export function NumberField({ value, onChange, decimal = true, className = '', min = 0, step = 1, ...rest }) {
  return (
    <input
      type="number"
      inputMode={decimal ? 'decimal' : 'numeric'}
      className={'num ' + className}
      value={value ?? ''}
      min={min}
      step={step}
      onChange={(e) => onChange(e.target.value === '' ? '' : +e.target.value)}
      {...rest}
    />
  )
}

/* ============================ Switch / Toggle ============================ */
export function Switch({ checked, onChange, disabled, ...rest }) {
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={!!checked}
      disabled={disabled}
      className={'sw' + (checked ? ' on' : '')}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  )
}

/* ============================ Segmented ============================ */
export function Segmented({ options, value, onChange, className = '' }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div className={'seg ' + className} style={{ '--n': options.length, '--i': i }}>
      <span className="seg-sel" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'on' : ''}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} />}
          {o.label && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  )
}

/* ============================ Stepper ============================ */
export function Stepper({ value, step = 1, min = 0, max = Infinity, onChange, unit, label, className = '', disabled = false }) {
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(v * 10) / 10))
  const bump = (dir) => onChange(clamp((+value || 0) + dir * step))

  return (
    <div className={'stp-w ' + className}>
      {label && <span className="stp-l">{label}</span>}
      <div className="stp">
        <button type="button" className="stp-btn" onClick={() => bump(-1)} disabled={disabled || value <= min} aria-label="Decrease">
          <Icon name="minus" />
        </button>
        <span className="val">
          <input
            type="number"
            className="num"
            value={value ?? 0}
            onChange={(e) => onChange(clamp(+e.target.value || 0))}
            disabled={disabled}
          />
          {unit && <i>{unit}</i>}
        </span>
        <button type="button" className="stp-btn" onClick={() => bump(1)} disabled={disabled || value >= max} aria-label="Increase">
          <Icon name="plus" />
        </button>
      </div>
    </div>
  )
}

/* ============================ Slider ============================ */
export function Slider({ value, min = 0, max = 100, step = 1, onChange, className = '', disabled = false }) {
  const pct = Math.min(100, Math.max(0, (((value - min) / (max - min)) * 100) || 0))
  return (
    <div className={'sld ' + className}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(+e.target.value)}
        style={{
          background: `linear-gradient(to right, var(--acc) ${pct}%, var(--surface-3) ${pct}%)`,
        }}
      />
    </div>
  )
}

/* ============================ Checkbox ============================ */
export function Check({ checked, onChange, label, className = '' }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!checked}
      aria-label={label}
      className={'chk' + (checked ? ' on' : '') + ' ' + className}
      onClick={() => onChange(!checked)}
    >
      <Icon name="check" />
    </button>
  )
}

/* ============================ Inset Grouped List ============================ */
export function Section({ title, footer, children, className = '' }) {
  return (
    <section className={'sect ' + className}>
      {title && <h2 className="sect-t">{title}</h2>}
      <div className="sect-b">{children}</div>
      {footer && <p className="sect-f">{footer}</p>}
    </section>
  )
}

export function Row({
  icon,
  iconTint,
  title,
  subtitle,
  value,
  accessory = 'none',
  onClick,
  danger,
  children,
  className = '',
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={'lrow' + (onClick ? ' tap' : '') + (danger ? ' danger' : '') + ' ' + className}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
    >
      {icon && (
        <span className="lrow-i" style={iconTint ? { '--tint': iconTint } : null}>
          <Icon name={icon} />
        </span>
      )}
      <span className="lrow-m">
        <span className="lrow-t">{title}</span>
        {subtitle && <span className="lrow-s">{subtitle}</span>}
      </span>
      {children}
      {value != null && <span className="lrow-v">{value}</span>}
      {accessory === 'chevron' && <Icon name="chevronRight" className="lrow-c" />}
      {accessory === 'check' && <Icon name="check" className="lrow-k" />}
    </Tag>
  )
}

/* ============================ Select Sheet ============================ */
export function SelectRow({ icon, iconTint, title, value, options, onChange, sheetTitle }) {
  const cur = options.find((o) => o.value === value)
  const open = () => {
    const { openSheet } = useUI.getState()
    openSheet((close) => (
      <div className="picker-sheet">
        <h3>{sheetTitle || title}</h3>
        <div className="sect-b">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className="lrow tap"
              onClick={() => {
                close()
                onChange(o.value)
              }}
            >
              <span className="lrow-m">
                <span className="lrow-t">{o.label}</span>
                {o.subtitle && <span className="lrow-s">{o.subtitle}</span>}
              </span>
              {o.value === value && <Icon name="check" className="lrow-k" />}
            </button>
          ))}
        </div>
      </div>
    ))
  }

  return (
    <Row
      icon={icon}
      iconTint={iconTint}
      title={title}
      value={cur ? cur.label : value}
      accessory="chevron"
      onClick={open}
    />
  )
}
