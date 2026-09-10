import type { AreaKind } from '@/types'
import { BoltIcon, BoxIcon, LayersIcon } from './icons'

/** Ikon per jenis area sesuai flowchart. */
export const AREA_ICON: Record<AreaKind, typeof BoxIcon> = {
  finish_good: BoxIcon,
  raw_material: LayersIcon,
  utility: BoltIcon,
}
