import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddContactForm } from "./add-contact-form";
import { AddRatingForm } from "./add-rating-form";
import { AddHiringSignalForm } from "./add-hiring-signal-form";
import { AddSignalForm } from "./add-signal-form";
import { AddPainSignalForm } from "./add-pain-signal-form";
import { AddActivityForm } from "./add-activity-form";
import { AddOfferForm } from "./add-offer-form";
import { OfferList } from "./offer-list";
import { ChannelBadge, channelLabel } from "./channel-badge";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select(
      `id, name, website, company_type, address_line_1, address_line_2, city, state, country, zip, phone, email,
       lifecycle_stage, lead_status, prospect_tier, qualification_summary, sdr_signal_summary, portfolio_size,
       parent_company:parent_company_id ( id, name ),
       owner:owner_id ( id, name )`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!company) notFound();

  const parentCompany = company.parent_company as unknown as { id: number; name: string } | null;
  const owner = company.owner as unknown as { id: number; name: string } | null;
  const isProperty = company.company_type === "Property";

  const [
    { data: propertyDetails },
    { data: children },
    { data: contactLinks },
    { data: ratings },
    { data: hiringSignals },
    { data: signals },
    { data: activities },
    { data: offers },
  ] = await Promise.all([
    isProperty
      ? supabase
          .from("property_details")
          .select("id, property_type, property_class, rooms_units, portfolio_role")
          .eq("company_id", id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("companies")
      .select("id, name, company_type, city, country")
      .eq("parent_company_id", id)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("contact_companies")
      .select(
        `is_primary, job_title, contact_role, is_verified, added_by_type,
         contact:contact_id!inner (
           id, first_name, last_name, deleted_at,
           contact_emails ( email, company_id, is_primary, is_verified ),
           contact_phones ( phone, company_id, is_primary, is_verified )
         )`
      )
      .eq("company_id", id)
      .is("contact.deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("company_ratings").select("channel, rating, review_count, captured_at").eq("company_id", id),
    supabase
      .from("company_hiring_signals")
      .select("id, role, job_title, strength, source_url, detected_at")
      .eq("company_id", id)
      .order("detected_at", { ascending: false }),
    supabase
      .from("company_signals")
      .select("id, signal_type, strength, source_url, detected_at")
      .eq("company_id", id)
      .order("detected_at", { ascending: false }),
    supabase
      .from("activities")
      .select("id, activity_type, actor_name, body, created_at")
      .eq("company_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("offer_recommendations")
      .select("id, service, type, rationale")
      .eq("company_id", id)
      .order("type"),
  ]);

  type Channel = { company_id: number | null; is_primary: boolean; is_verified: boolean; email?: string; phone?: string };
  type CompanyContact = {
    id: number;
    first_name: string;
    last_name: string | null;
    contact_emails: Channel[];
    contact_phones: Channel[];
    // This company's link to the person
    job_title: string | null;
    contact_role: string | null;
    is_verified: boolean;
    added_by_type: string;
  };
  // Show the emails/phones tied to this company plus the person's general ones.
  const forThisCompany = (rows: Channel[]) =>
    rows.filter((r) => r.company_id === null || Number(r.company_id) === Number(id));
  const contacts = (contactLinks ?? []).map(({ contact, ...link }) => ({
    ...(contact as unknown as Omit<CompanyContact, "job_title" | "contact_role" | "is_verified" | "added_by_type">),
    ...link,
  })) as CompanyContact[];

  const { data: painSignals } = propertyDetails
    ? await supabase
        .from("property_pain_signals")
        .select("id, pain_type, source_url, detected_at")
        .eq("property_id", propertyDetails.id)
        .order("detected_at", { ascending: false })
    : { data: null };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-8">
      <div className="flex items-start justify-between">
        <Link href="/companies" className="text-sm text-zinc-500 hover:text-zinc-700">
          Back to Companies
        </Link>
        <Link
          href={`/companies/${id}/edit`}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr_320px]">
        {/* Left: company identity */}
        <aside className="space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <h1 className="text-xl font-semibold leading-tight text-zinc-900">{company.name}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-zinc-600">
              <span className="rounded bg-zinc-100 px-2 py-0.5">{company.company_type}</span>
              <span className="rounded bg-zinc-100 px-2 py-0.5">{company.lifecycle_stage}</span>
              <span className="rounded bg-zinc-100 px-2 py-0.5">{company.lead_status}</span>
              {company.prospect_tier && (
                <span className="rounded bg-zinc-100 px-2 py-0.5">{company.prospect_tier}</span>
              )}
            </div>

            {parentCompany && (
              <Link
                href={`/companies/${parentCompany.id}`}
                className="mt-3 block text-sm text-zinc-600 hover:underline"
              >
                Part of <span className="font-medium text-zinc-900">{parentCompany.name}</span>
              </Link>
            )}

            <dl className="mt-4 space-y-3 border-t border-zinc-100 pt-4 text-sm">
              <Field label="Website" value={company.website} />
              <Field label="Phone" value={company.phone} />
              <Field label="General email" value={company.email} />
              <Field
                label="Address"
                value={[company.address_line_1, company.address_line_2].filter(Boolean).join(", ")}
              />
              <Field label="City / State" value={[company.city, company.state].filter(Boolean).join(", ")} />
              <Field label="Country / Zip" value={[company.country, company.zip].filter(Boolean).join(", ")} />
              <Field label="Owner" value={owner?.name ?? "Unassigned"} />
            </dl>
          </div>
        </aside>

        {/* Center: property, ratings, portfolio, qualification */}
        <main className="space-y-4">
          {propertyDetails && (
            <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">Property Profile</h2>
                <AddPainSignalForm companyId={Number(id)} />
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Type" value={propertyDetails.property_type} />
                <Stat label="Class" value={propertyDetails.property_class} />
                <Stat label="Rooms/Units" value={propertyDetails.rooms_units} />
                <Stat label="Portfolio Role" value={propertyDetails.portfolio_role} />
              </div>

              {!!painSignals?.length && (
                <div className="border-t border-zinc-100 pt-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Pain Signals
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {painSignals.map((p) => (
                      <span key={p.id} className="rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-700">
                        {p.pain_type}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Ratings &amp; Reviews</h2>
              <AddRatingForm companyId={Number(id)} />
            </div>
            {!ratings?.length ? (
              <p className="text-sm text-zinc-500">No ratings logged yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {ratings.map((r) => (
                  <div
                    key={r.channel}
                    className="flex items-center gap-2 rounded-lg border border-zinc-100 p-3"
                  >
                    <ChannelBadge channel={r.channel} />
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">{r.rating ?? "—"}</div>
                      <div className="text-xs text-zinc-500">
                        {channelLabel(r.channel)} · {r.review_count ?? 0} reviews
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {!isProperty && (
            <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-zinc-900">
                Portfolio ({children?.length ?? 0} listed
                {company.portfolio_size ? ` of ${company.portfolio_size} known` : ""})
              </h2>
              {!children?.length ? (
                <p className="text-sm text-zinc-500">No properties linked to this group yet.</p>
              ) : (
                <ul className="divide-y divide-zinc-100 text-sm">
                  {children.map((child) => (
                    <li key={child.id} className="flex items-center justify-between py-2">
                      <Link href={`/companies/${child.id}`} className="font-medium text-zinc-900 hover:underline">
                        {child.name}
                      </Link>
                      <span className="text-zinc-500">
                        {child.company_type} · {[child.city, child.country].filter(Boolean).join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Offer Recommendations</h2>
              <AddOfferForm companyId={Number(id)} />
            </div>
            {!offers?.length ? (
              <p className="text-sm text-zinc-500">No offer recommendations yet.</p>
            ) : (
              <OfferList companyId={Number(id)} offers={offers} />
            )}
          </section>

          <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-zinc-900">Qualification</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-zinc-500">Qualification Summary</dt>
                <dd className="text-zinc-900">{company.qualification_summary ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Why Now (SDR Signal Summary)</dt>
                <dd className="text-zinc-900">{company.sdr_signal_summary ?? "—"}</dd>
              </div>
            </dl>
          </section>
        </main>

        {/* Right: contacts, signals, activity */}
        <aside className="space-y-4">
          <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Contacts ({contacts?.length ?? 0})</h2>
            </div>
            <AddContactForm companyId={Number(id)} />
            {!!contacts?.length && (
              <ul className="divide-y divide-zinc-100 text-sm">
                {contacts.map((c) => (
                  <li key={c.id} className="space-y-0.5 py-3">
                    <div className="font-medium text-zinc-900">
                      <Link href={`/contacts/${c.id}/edit`} className="hover:underline">
                        {c.first_name} {c.last_name ?? ""}
                      </Link>
                    </div>
                    <div className="text-xs text-zinc-500">
                      {[c.job_title, c.contact_role].filter(Boolean).join(" · ") || "—"}
                      {c.is_verified ? (
                        <span className="ml-2 text-green-700">✓ verified</span>
                      ) : (
                        <span className="ml-2 text-amber-700">
                          {c.added_by_type === "agent" ? "needs review" : "unverified"}
                        </span>
                      )}
                    </div>
                    {forThisCompany(c.contact_emails).map((e) => (
                      <div key={e.email} className="text-xs text-zinc-500">
                        {e.email}
                        {!e.is_verified && <span className="ml-1 text-amber-700">(unverified)</span>}
                      </div>
                    ))}
                    {forThisCompany(c.contact_phones).map((p) => (
                      <div key={p.phone} className="text-xs text-zinc-500">
                        {p.phone}
                        {!p.is_verified && <span className="ml-1 text-amber-700">(unverified)</span>}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Hiring Signals</h2>
            </div>
            <AddHiringSignalForm companyId={Number(id)} />
            {!!hiringSignals?.length && (
              <ul className="divide-y divide-zinc-100 text-sm">
                {hiringSignals.map((h) => (
                  <li key={h.id} className="py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-900">{h.role ?? h.job_title}</span>
                      <span className="text-xs text-zinc-500">{h.strength}</span>
                    </div>
                    <div className="text-xs text-zinc-500">{h.job_title}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Sales Signals</h2>
            </div>
            <AddSignalForm companyId={Number(id)} />
            {!!signals?.length && (
              <ul className="divide-y divide-zinc-100 text-sm">
                {signals.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2">
                    <span className="font-medium text-zinc-900">{s.signal_type}</span>
                    <span className="text-xs text-zinc-500">{s.strength}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Activity</h2>
            </div>
            <AddActivityForm companyId={Number(id)} />
            {!!activities?.length && (
              <ul className="divide-y divide-zinc-100 text-sm">
                {activities.map((a) => (
                  <li key={a.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-900">{a.activity_type}</span>
                      <span className="text-xs text-zinc-500">
                        {new Date(a.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500">{a.actor_name}</div>
                    {a.body && <p className="mt-1 text-zinc-600">{a.body}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value, href }: { label: string; value?: string | null; href?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-zinc-900">
        {value && href ? (
          <a href={href} target="_blank" rel="noreferrer" className="underline">
            {value}
          </a>
        ) : (
          value || "—"
        )}
      </dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-sm font-medium text-zinc-900">{value ?? "—"}</div>
    </div>
  );
}
