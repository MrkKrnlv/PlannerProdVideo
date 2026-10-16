// Набор иконок (stroke = currentColor)
const P = {
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  plans: <><rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /><path d="M7.5 13.5h3M7.5 17h6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  growth: <><path d="M4 19h16" /><path d="M6 15l4-4 3 3 5-6" /><path d="M15 8h3v3" /></>,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  bolt: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />,
  repeat: <><path d="M17 2.5l3 3-3 3" /><path d="M4 11.5v-1a5 5 0 0 1 5-5h11" /><path d="M7 21.5l-3-3 3-3" /><path d="M20 12.5v1a5 5 0 0 1-5 5H4" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></>,
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  down: <path d="M5 9l7 7 7-7" />,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  inbox: <><path d="M3 13l2.5-8h13L21 13v6H3z" /><path d="M3 13h5l1.5 2.5h5L16 13h5" /></>,
  note: <><path d="M6 3h9l4 4v14H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h5" /></>,
  timer: <><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  download: <><path d="M12 4v11M7 10.5l5 5 5-5" /><path d="M4 19.5h16" /></>,
  upload: <><path d="M12 15.5v-11M7 9l5-5 5 5" /><path d="M4 19.5h16" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>,
  send: <path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" />,
  spark: <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  sun: <><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  flame: <path d="M12 21c4 0 7-2.7 7-6.6 0-4.2-3.4-6.6-4.6-10.4-1 2-1.6 3.3-3.4 4.6C9.2 5.8 8.6 4.4 8 3.5 6.2 6.5 5 9.4 5 14.4 5 18.3 8 21 12 21z" />,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".8" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
  coffee: <><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17M8 3.5v2.5M12 3.5v2.5" /></>,
  wand: <><path d="M4 20L15 9M14 4v3M18.5 5.5l-2 2M20 10h-3M12.5 5.5l2 2" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16.5 6.5l2.5 2.5M14.5 8.5l2 2" /></>,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></>,
  sync: <><path d="M20 11a8 8 0 0 0-14.3-4.5M4 13a8 8 0 0 0 14.3 4.5" /><path d="M5 3v4h4M19 21v-4h-4" /></>,
  bot: <><rect x="4" y="8" width="16" height="12" rx="4" /><path d="M12 4v4M9 14h.01M15 14h.01" /></>,
  moodface: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 10h.01M15 10h.01" /></>,
  grip: <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />,
  calendarDay: <><rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /><rect x="7" y="12.5" width="4" height="4" rx="1" /></>,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
};

export default function Icon({ name, size = 20, stroke = 1.8, className = '', fill = 'none' }) {
  return (
    <svg className={'ic ' + className} width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name] || null}
    </svg>
  );
}
