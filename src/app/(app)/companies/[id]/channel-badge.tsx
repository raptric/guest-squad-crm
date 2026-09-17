const CHANNEL_STYLE: Record<string, { label: string; letter: string; className: string }> = {
  google: { label: "Google", letter: "G", className: "bg-blue-600" },
  booking_com: { label: "Booking.com", letter: "B", className: "bg-blue-900" },
  expedia: { label: "Expedia", letter: "E", className: "bg-amber-500" },
  hotels_com: { label: "Hotels.com", letter: "H", className: "bg-red-600" },
  tripadvisor: { label: "TripAdvisor", letter: "T", className: "bg-green-600" },
  vrbo: { label: "Vrbo", letter: "V", className: "bg-sky-600" },
  airbnb: { label: "Airbnb", letter: "A", className: "bg-rose-500" },
  other: { label: "Other", letter: "?", className: "bg-zinc-400" },
};

export function ChannelBadge({ channel }: { channel: string }) {
  const style = CHANNEL_STYLE[channel] ?? CHANNEL_STYLE.other;
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${style.className}`}
      title={style.label}
    >
      {style.letter}
    </span>
  );
}

export function channelLabel(channel: string) {
  return CHANNEL_STYLE[channel]?.label ?? channel;
}
