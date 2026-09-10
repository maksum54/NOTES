import type { SVGProps } from 'react'

/* Ikon garis tipis bergaya SF Symbols — semuanya mewarisi currentColor. */

type P = SVGProps<SVGSVGElement>

function Base({ children, ...p }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={20}
      height={20}
      aria-hidden="true"
      {...p}
    >
      {children}
    </svg>
  )
}

export const HomeIcon = (p: P) => (
  <Base {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-5.5h4V21h3.5a1 1 0 0 0 1-1V9.5" />
  </Base>
)

export const FolderIcon = (p: P) => (
  <Base {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2a1.5 1.5 0 0 1 1.1.5l1.3 1.4h7.4A1.5 1.5 0 0 1 20 9.4V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </Base>
)

export const BookIcon = (p: P) => (
  <Base {...p}>
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H18a2 2 0 0 1 2 2v12.5" />
    <path d="M4 4.5V19a2 2 0 0 0 2 2h14" />
    <path d="M20 17.5H6.5A2.5 2.5 0 0 0 4 20" />
    <path d="M8 8h8M8 11.5h5" />
  </Base>
)

export const BellIcon = (p: P) => (
  <Base {...p}>
    <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
    <path d="M10.3 19a2 2 0 0 0 3.4 0" />
  </Base>
)

export const SparkIcon = (p: P) => (
  <Base {...p}>
    <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
    <path d="m18.5 15.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
  </Base>
)

export const GearIcon = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 9 18.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </Base>
)

export const PlusIcon = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
)

export const XIcon = (p: P) => (
  <Base {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Base>
)

export const CheckIcon = (p: P) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Base>
)

export const ChevronRight = (p: P) => (
  <Base {...p}>
    <path d="m9 5 7 7-7 7" />
  </Base>
)

export const ChevronLeft = (p: P) => (
  <Base {...p}>
    <path d="m15 5-7 7 7 7" />
  </Base>
)

export const ChevronDown = (p: P) => (
  <Base {...p}>
    <path d="m5 9 7 7 7-7" />
  </Base>
)

export const SearchIcon = (p: P) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Base>
)

export const TrashIcon = (p: P) => (
  <Base {...p}>
    <path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
    <path d="M6.5 7 7 19a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l.5-12" />
    <path d="M10.5 11v6M13.5 11v6" />
  </Base>
)

export const EditIcon = (p: P) => (
  <Base {...p}>
    <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4 16.5Z" />
    <path d="m14.5 6.5 3 3" />
  </Base>
)

export const SunIcon = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" />
  </Base>
)

export const MoonIcon = (p: P) => (
  <Base {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </Base>
)

export const MonitorIcon = (p: P) => (
  <Base {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8.5 21h7M12 17v4" />
  </Base>
)

export const GlobeIcon = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" />
  </Base>
)

export const CloudIcon = (p: P) => (
  <Base {...p}>
    <path d="M7 18.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17.3 9a3.75 3.75 0 0 1 .2 9.5Z" />
  </Base>
)

export const FileIcon = (p: P) => (
  <Base {...p}>
    <path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5Z" />
    <path d="M13.5 3v5.5H19M9 13h6M9 17h6" />
  </Base>
)

export const UploadIcon = (p: P) => (
  <Base {...p}>
    <path d="M12 16V4M8 7.5 12 3.5l4 4" />
    <path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16" />
  </Base>
)

export const DownloadIcon = (p: P) => (
  <Base {...p}>
    <path d="M12 3.5v12M8 12l4 4 4-4" />
    <path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16" />
  </Base>
)

export const ImageIcon = (p: P) => (
  <Base {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <circle cx="8.5" cy="10" r="1.6" />
    <path d="m3.5 17 4.8-4.2a1.6 1.6 0 0 1 2.1 0L15 17M14 14.2l1.6-1.4a1.6 1.6 0 0 1 2.1 0l2.8 2.4" />
  </Base>
)

export const LinkIcon = (p: P) => (
  <Base {...p}>
    <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
    <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 1 0 5.7 5.7l1.3-1.3" />
  </Base>
)

export const PenIcon = (p: P) => (
  <Base {...p}>
    <path d="M3 21s.5-3 1.2-3.8L16 5.4a2.3 2.3 0 0 1 3.3 3.3L7.8 19.8C7 20.5 3 21 3 21Z" />
    <path d="m14.5 7 2.5 2.5" />
  </Base>
)

export const HighlighterIcon = (p: P) => (
  <Base {...p}>
    <path d="M13 4.5 19.5 11 11 19.5H5.5L4 18l1.5-4Z" />
    <path d="M3 21h8" />
  </Base>
)

export const EraserIcon = (p: P) => (
  <Base {...p}>
    <path d="M8.5 20H20M4.6 16.4 11 10l5 5-5.5 5.5H7l-2.4-2.4a1.5 1.5 0 0 1 0-2.1Z" />
    <path d="m11 10 4-4a1.8 1.8 0 0 1 2.6 0l3.4 3.4a1.8 1.8 0 0 1 0 2.6l-5 5" />
  </Base>
)

export const UndoIcon = (p: P) => (
  <Base {...p}>
    <path d="M4 9h9a5 5 0 0 1 0 10h-2" />
    <path d="m7.5 5.5-3.5 3.5 3.5 3.5" />
  </Base>
)

export const TextIcon = (p: P) => (
  <Base {...p}>
    <path d="M5 6.5V5h14v1.5M12 5v14M9 19h6" />
  </Base>
)

export const SendIcon = (p: P) => (
  <Base {...p}>
    <path d="M20.5 3.5 10 14M20.5 3.5 14 21l-4-7-7-4Z" />
  </Base>
)

export const AlertIcon = (p: P) => (
  <Base {...p}>
    <path d="M12 4.5 21 20H3Z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </Base>
)

export const ClockIcon = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.2 2" />
  </Base>
)

export const TaskIcon = (p: P) => (
  <Base {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" />
  </Base>
)

export const BuildingIcon = (p: P) => (
  <Base {...p}>
    <path d="M4 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15" />
    <path d="M14 10h4a2 2 0 0 1 2 2v9M3 21h18" />
    <path d="M7.5 8h3M7.5 12h3M7.5 16h3M17 14v.01M17 18v.01" />
  </Base>
)

export const BoxIcon = (p: P) => (
  <Base {...p}>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" />
    <path d="M4 7.5 12 12l8-4.5M12 12v9" />
  </Base>
)

export const BoltIcon = (p: P) => (
  <Base {...p}>
    <path d="M13 3 5 13.5h6L10 21l8-10.5h-6Z" />
  </Base>
)

export const LayersIcon = (p: P) => (
  <Base {...p}>
    <path d="m12 3 9 4.5-9 4.5-9-4.5Z" />
    <path d="m3 12.5 9 4.5 9-4.5" />
  </Base>
)

export const LockIcon = (p: P) => (
  <Base {...p}>
    <rect x="4.5" y="10" width="15" height="11" rx="2.5" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
  </Base>
)

export const LogoutIcon = (p: P) => (
  <Base {...p}>
    <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
    <path d="M16 16.5 20.5 12 16 7.5M20 12H9" />
  </Base>
)

export const GoogleIcon = (p: P) => (
  <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" {...p}>
    <path
      fill="#4285F4"
      d="M21.6 12.23c0-.73-.07-1.43-.19-2.1H12v3.98h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.89-1.74 2.98-4.3 2.98-7.4Z"
    />
    <path
      fill="#34A853"
      d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.75-5.59-4.11H3.06v2.58A10 10 0 0 0 12 22Z"
    />
    <path fill="#FBBC05" d="M6.41 13.92a5.99 5.99 0 0 1 0-3.84V7.5H3.06a10 10 0 0 0 0 9l3.35-2.58Z" />
    <path
      fill="#EA4335"
      d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.98 14.7 2 12 2A10 10 0 0 0 3.06 7.5l3.35 2.58C7.2 7.72 9.4 5.95 12 5.95Z"
    />
  </svg>
)

export const MenuIcon = (p: P) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
)

export const ExcelIcon = (p: P) => (
  <Base {...p}>
    <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8Z" />
    <path d="M14 3v5h5" />
    <path d="m9 12 4 5M13 12l-4 5" />
  </Base>
)

export const OfflineIcon = (p: P) => (
  <Base {...p}>
    <path d="M3 3l18 18" />
    <path d="M8.2 8.3A4 4 0 0 0 7 18.5h9.3" />
    <path d="M18.6 16.9A3.75 3.75 0 0 0 17.3 9a5.5 5.5 0 0 0-5-3.9" />
  </Base>
)

export const ShareIcon = (p: P) => (
  <Base {...p}>
    <circle cx="18" cy="5" r="2.6" />
    <circle cx="6" cy="12" r="2.6" />
    <circle cx="18" cy="19" r="2.6" />
    <path d="m8.4 10.8 7.2-4.4M8.4 13.2l7.2 4.4" />
  </Base>
)

export const UsersIcon = (p: P) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
    <path d="M15.5 5.4a3.2 3.2 0 0 1 0 5.9M17 14.3a5.5 5.5 0 0 1 3.5 5.2" />
  </Base>
)

export const ExpandIcon = (p: P) => (
  <Base {...p}>
    <path d="M9 3H3v6M15 21h6v-6M3 15v6h6M21 9V3h-6" />
  </Base>
)

export const ShrinkIcon = (p: P) => (
  <Base {...p}>
    <path d="M3 9h6V3M21 15h-6v6M9 21v-6H3M15 3v6h6" />
  </Base>
)
