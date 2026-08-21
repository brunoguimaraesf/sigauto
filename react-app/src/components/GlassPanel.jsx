export function GlassPanel({ children, className = '', style = {}, ...props }) {
  return (
    <div className={`glass ${className}`} style={style} {...props}>
      {children}
    </div>
  )
}
