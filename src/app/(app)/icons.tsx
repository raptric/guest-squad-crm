// Small line-icon set shared by the sidebar, card headings and field rows.
// All icons are 24x24 outlines that inherit the current text colour.
type IconProps = { className?: string };

function make(children: React.ReactNode) {
  return function Icon({ className = "h-5 w-5" }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };
}

export const BuildingIcon = make(
  <>
    <rect x="5" y="3" width="14" height="18" rx="1.5" />
    <path d="M9 7.5h.01M15 7.5h.01M9 11.5h.01M15 11.5h.01M9 15.5h.01M15 15.5h.01" />
    <path d="M10 21v-3h4v3" />
  </>
);
export const CityIcon = make(
  <>
    <rect x="4" y="9" width="7" height="12" rx="1" />
    <rect x="11" y="3" width="9" height="18" rx="1" />
    <path d="M7 13h1M7 17h1M14 7h3M14 11h3M14 15h3" />
  </>
);
export const LayersIcon = make(
  <>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </>
);
export const UsersIcon = make(
  <>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
    <path d="M16 5.2a3 3 0 010 5.6M17.5 14.8c2 .6 3.5 2.4 3.5 5.2" />
  </>
);
export const UserIcon = make(
  <>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
  </>
);
export const IdCardIcon = make(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="11" r="2" />
    <path d="M6 16c.5-1.5 1.8-2.2 3-2.2s2.5.7 3 2.2M14.5 10h4M14.5 13.5h3" />
  </>
);
export const MapPinIcon = make(
  <>
    <path d="M12 21s7-6.2 7-11.5a7 7 0 10-14 0C5 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </>
);
export const GlobeIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z" />
  </>
);
export const MailIcon = make(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 7l8.5 6 8.5-6" />
  </>
);
export const PhoneIcon = make(
  <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />
);
export const FlagIcon = make(<path d="M5 21V4M5 4h11l-2 4 2 4H5" />);
export const MapIcon = make(
  <>
    <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
    <path d="M9 4v14M15 6v14" />
  </>
);
export const HashIcon = make(<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16" />);
export const StarIcon = make(
  <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5z" />
);
export const ShieldCheckIcon = make(
  <>
    <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" />
    <path d="M8.5 12l2.5 2.5 4.5-5" />
  </>
);
export const BulbIcon = make(
  <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" />
);
export const PulseIcon = make(<path d="M3 12h4l2.5-6 4 12 2.5-6H21" />);
export const ClockIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>
);
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />);
export const CheckIcon = make(<path d="M5 12.5l4.5 4.5L19 7" />);
export const ExternalLinkIcon = make(
  <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
);
export const PencilIcon = make(<path d="M4 20h4l11-11-4-4L4 16v4zM13.5 6.5l4 4" />);
export const ClipboardCheckIcon = make(
  <>
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4h6v3H9zM9.5 13.5l2 2 3.5-4" />
  </>
);
export const GridIcon = make(
  <>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </>
);
export const ChartIcon = make(<path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" />);
export const CogIcon = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
  </>
);

export const MegaphoneIcon = make(
  <>
    <path d="M4 10v4a1 1 0 001 1h2l5 4V5L7 9H5a1 1 0 00-1 1z" />
    <path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" />
  </>
);
export const ListCheckIcon = make(
  <>
    <path d="M4 7l1.5 1.5L8 6M4 13l1.5 1.5L8 12M4 19l1.5 1.5L8 18" />
    <path d="M12 7h8M12 13h8M12 19h8" />
  </>
);
export const CopyIcon = make(<path d="M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />);
export const TrashIcon = make(
  <>
    <path d="M5 7h14M10 4h4M7 7l1 13h8l1-13" />
    <path d="M10 11v6M14 11v6" />
  </>
);
export const ArrowUpIcon = make(<path d="M12 19V5M6 11l6-6 6 6" />);
export const ArrowDownIcon = make(<path d="M12 5v14M6 13l6 6 6-6" />);
