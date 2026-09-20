import type { ChannelRow, LinkRow } from "./contact-types";

// Shows who added a value and the evidence behind it, so a reviewer can verify it.
export function ProvenanceNote({
  row,
}: {
  row: Pick<LinkRow | ChannelRow, "added_by_type" | "added_by_name" | "evidence" | "source_url" | "is_verified">;
}) {
  if (row.added_by_type !== "agent") return null;
  return (
    <div className="mt-1 text-xs text-zinc-500">
      <span
        className={`mr-2 rounded px-1.5 py-0.5 ${row.is_verified ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
      >
        {row.is_verified ? "Verified" : "Needs review"}
      </span>
      Added by {row.added_by_name ?? "agent"}
      {row.evidence && <> &mdash; {row.evidence}</>}
      {row.source_url && (
        <>
          {" "}
          <a href={row.source_url} target="_blank" rel="noreferrer" className="underline">
            source
          </a>
        </>
      )}
    </div>
  );
}
