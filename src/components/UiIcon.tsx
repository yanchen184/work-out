export type UiIconName = 'progress' | 'template' | 'save' | 'reset' | 'info' | 'trash'

export function UiIcon({ name }: { readonly name: UiIconName }) {
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconFor(name)}
    </svg>
  )
}

function iconFor(name: UiIconName) {
  switch (name) {
    case 'progress':
      return (
        <>
          <path d="M5 19V11M12 19V5M19 19v-6" />
          <path d="M3 19h18" />
        </>
      )
    case 'template':
      return (
        <>
          <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
          <path d="M7.5 3.5v4M16.5 3.5v4M3.5 10h17" />
          <path d="m13.2 12-3.1 4h2.7l-1.2 3.2 3.4-4.5h-2.7z" />
        </>
      )
    case 'save':
      return (
        <>
          <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
          <path d="M7.5 3.5v4M16.5 3.5v4M3.5 10h17M8.2 15.2l2.3 2.2 5.1-5.1" />
        </>
      )
    case 'reset':
      return (
        <>
          <path d="M4.4 9.2A8 8 0 1 1 4.1 15" />
          <path d="M4.4 4.8v4.4h4.4" />
        </>
      )
    case 'info':
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 10.8v5.3M12 7.6h.01" />
        </>
      )
    case 'trash':
      return (
        <>
          <path className="trash-lid" d="M4 7h16M9 7V4.7h6V7" />
          <path className="trash-body" d="m6 7 1 13h10l1-13M10 11v5M14 11v5" />
        </>
      )
  }
}
