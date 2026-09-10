/** Latar gradien + blob melayang di belakang seluruh panel kaca. */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <div
        className="aurora-blob animate-drift"
        style={{
          width: '46vmax',
          height: '46vmax',
          top: '-14vmax',
          left: '-10vmax',
          background: 'rgb(var(--blob-1))',
        }}
      />
      <div
        className="aurora-blob animate-drift"
        style={{
          width: '40vmax',
          height: '40vmax',
          top: '18vmax',
          right: '-14vmax',
          background: 'rgb(var(--blob-2))',
          animationDelay: '-8s',
        }}
      />
      <div
        className="aurora-blob animate-drift"
        style={{
          width: '38vmax',
          height: '38vmax',
          bottom: '-16vmax',
          left: '22vmax',
          background: 'rgb(var(--blob-3))',
          animationDelay: '-16s',
        }}
      />
    </div>
  )
}
