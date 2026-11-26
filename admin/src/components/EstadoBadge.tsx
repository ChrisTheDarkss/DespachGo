export default function EstadoBadge({ estado }: { estado: string }) {
  return <span className={`badge badge-${estado}`}>{estado.replace(/_/g, ' ')}</span>
}
