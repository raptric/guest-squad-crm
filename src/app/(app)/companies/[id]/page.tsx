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
import { VerifyBox } from "./verify-box";
import { InlineField } from "./inline-field";
import { getPicklistValues } from "@/lib/picklists";
import { timeAgo } from "@/lib/time-ago";

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
       lifecycle_stage, lead_status, verification_status, prospect_tier, qualification_summary, sdr_signal_summary, portfolio_size,
       parent_company:parent_company_id ( id, name ),
       owner:owner_id ( id, name )`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!company) notFound();

  // Latest human review (shown in the Verify box); the box only appears for Qualified companies
  // or ones that were already verified.
  const { data: lastReviewRow } = await supabase
    .from("company_reviews")
    .select("reviewer_name, had_errors, notes, created_at")
    .eq("company_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastReview = lastReviewRow
    ? { reviewer: lastReviewRow.reviewer_name, when: timeAgo(lastReviewRow.created_at), hadErrors: lastReviewRow.had_errors, notes: lastReviewRow.notes }
    : null;
  const showVerify = company.lead_status === "Qualified" || company.verification_status !== null;

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

  // Options for the inline dropdowns. A legacy value no longer in a picklist stays selectable.
  const [countries, tiers, propertyTypes, propertyClasses, portfolioRoles, { data: userRows }] = await Promise.all([
    getPicklistValues("country"),
    getPicklistValues("prospect_tier"),
    getPicklistValues("property_type"),
    getPicklistValues("property_class"),
    getPicklistValues("portfolio_role"),
    supabase.from("users").select("id, name").order("name"),
  ]);
  const options = (list: string[], current?: string | null) =>
    (current && !list.includes(current) ? [current, ...list] : list).map((v) => ({ value: v, label: v }));
  const ownerOptions = (userRows ?? []).map((u) => ({ value: String(u.id), label: u.name }));
  const companyId = Number(id);

  const LEAD_CHIP: Record<string, string> = {
    New: "bg-sky-100 text-sky-800",
    Qualified: "bg-emerald-100 text-emerald-800",
    "Needs Review": "bg-amber-100 text-amber-800",
    DisQualified: "bg-zinc-200 text-zinc-600",
  };
  const inline = { companyId, target: "company" as const };
  const prop = { companyId, target: "property" as const };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <Link href="/companies" className="text-sm text-zinc-500 hover:text-zinc-800">
          &larr; Back to Companies
        </Link>
        <Link
          href={`/companies/${id}/edit`}
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
        >
          Edit all fields
        </Link>
      </div>

      {/* Header: identity + key facts on top; contact, property profile and guest ratings underneath */}
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4 bg-gradient-to-r from-zinc-50 to-white p-6">
          <div className="min-w-[260px] flex-1 space-y-3">
            <InlineField {...inline} field="name" label="Name" value={company.name} variant="title" />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Chip className="bg-white text-zinc-700 ring-1 ring-zinc-200">{company.company_type}</Chip>
              <Chip className="bg-white text-zinc-700 ring-1 ring-zinc-200">{company.lifecycle_stage}</Chip>
              <Chip className={LEAD_CHIP[company.lead_status] ?? "bg-zinc-100 text-zinc-700"}>{company.lead_status}</Chip>
              {company.verification_status && (
                <Chip className={company.verification_status === "Ready for Outreach" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                  {company.verification_status}
                </Chip>
              )}
            </div>
            {parentCompany && (
              <Link href={`/companies/${parentCompany.id}`} className="block text-sm text-zinc-600 hover:underline">
                Part of <span className="font-medium text-zinc-900">{parentCompany.name}</span>
              </Link>
            )}
          </div>
          {propertyDetails && (
            <div className="min-w-[320px] pt-1">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Property profile</h2>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 2xl:grid-cols-4">
                <InlineField {...prop} field="property_type" label="Type" type="select" options={options(propertyTypes, propertyDetails.property_type)} value={propertyDetails.property_type} />
                <InlineField {...prop} field="property_class" label="Class" type="select" options={options(propertyClasses, propertyDetails.property_class)} value={propertyDetails.property_class} />
                <InlineField {...prop} field="rooms_units" label="Rooms / units" type="number" value={propertyDetails.rooms_units === null ? null : String(propertyDetails.rooms_units)} />
                <InlineField {...prop} field="portfolio_role" label="Portfolio role" type="select" options={options(portfolioRoles, propertyDetails.portfolio_role)} value={propertyDetails.portfolio_role} />
              </dl>
            </div>
          )}
          <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
            <InlineField {...inline} field="prospect_tier" label="Tier" variant="big" type="select" options={options(tiers, company.prospect_tier)} value={company.prospect_tier} />
            <InlineField {...inline} field="owner_id" label="Owner" variant="big" type="select" options={ownerOptions} value={owner ? String(owner.id) : null} emptyText="Unassigned" />
            <QuickStat label="Contacts" value={contacts.length} />
          </div>
        </div>

        <div
          className="grid gap-x-10 gap-y-6 border-t border-zinc-100 p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
        >
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Contact &amp; location</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 xl:grid-cols-4">
              <InlineField {...inline} field="website" label="Website" value={company.website} className="col-span-2" />
              <InlineField {...inline} field="email" label="General email" type="email" value={company.email} className="col-span-2" />
              <InlineField {...inline} field="phone" label="Phone" type="tel" value={company.phone} />
              <InlineField {...inline} field="address_line_1" label="Address" value={company.address_line_1} className="col-span-2" />
              <InlineField {...inline} field="address_line_2" label="Address line 2" value={company.address_line_2} />
              <InlineField {...inline} field="city" label="City" value={company.city} />
              <InlineField {...inline} field="state" label="State" value={company.state} />
              <InlineField {...inline} field="country" label="Country" type="select" options={options(countries, company.country)} value={company.country} />
              <InlineField {...inline} field="zip" label="Zip" value={company.zip} />
            </dl>
          </div>


          <div className="lg:border-l lg:border-zinc-100 lg:pl-10">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Ratings &amp; reviews</h2>
              <AddRatingForm companyId={companyId} />
            </div>
            {!ratings?.length ? (
              <p className="text-sm text-zinc-400">No ratings logged yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 2xl:grid-cols-3">
                {ratings.map((r) => (
                  <div key={r.channel} className="flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                    <ChannelBadge channel={r.channel} />
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-semibold leading-tight text-zinc-900">{r.rating ?? "—"}</span>
                        <span className="truncate text-xs text-zinc-500">{(r.review_count ?? 0).toLocaleString()} reviews</span>
                      </div>
                      <div className="truncate text-xs text-zinc-600">{channelLabel(r.channel)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* Main column */}
        <main className="min-w-0 space-y-5">
          {!isProperty && (
            <Card title={`Portfolio (${children?.length ?? 0} listed${company.portfolio_size ? ` of ${company.portfolio_size} known` : ""})`}>
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
            </Card>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <Card title={`Contacts (${contacts.length})`} action={<AddContactForm companyId={companyId} />}>
              {!contacts.length ? (
                <p className="text-sm text-zinc-500">No contacts yet.</p>
              ) : (
                <ul className="grid gap-3 2xl:grid-cols-2">
                  {contacts.map((c) => (
                    <li key={c.id} className="space-y-1 rounded-lg border border-zinc-200 p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/contacts/${c.id}/edit`} className="font-medium text-zinc-900 hover:underline">
                          {c.first_name} {c.last_name ?? ""}
                        </Link>
                        {c.is_verified ? (
                          <Chip className="bg-emerald-100 text-emerald-800">Verified</Chip>
                        ) : (
                          <Chip className="bg-amber-100 text-amber-800">{c.added_by_type === "agent" ? "Needs review" : "Unverified"}</Chip>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500">{[c.job_title, c.contact_role].filter(Boolean).join(" · ") || "—"}</div>
                      {forThisCompany(c.contact_emails).map((e) => (
                        <div key={e.email} className="truncate text-sm text-zinc-700">
                          {e.email}
                          {!e.is_verified && <span className="ml-1 text-xs text-amber-700">(unverified)</span>}
                        </div>
                      ))}
                      {forThisCompany(c.contact_phones).map((p) => (
                        <div key={p.phone} className="text-sm text-zinc-700">
                          {p.phone}
                          {!p.is_verified && <span className="ml-1 text-xs text-amber-700">(unverified)</span>}
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Signals">
              <div className="space-y-5">
                {propertyDetails && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Pain</h3>
                      <AddPainSignalForm companyId={companyId} />
                    </div>
                    {painSignals?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {painSignals.map((p) => (
                          <span key={p.id} className="rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-700">
                            {p.pain_type}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-400">None logged.</p>
                    )}
                  </div>
                )}
                <div className={`space-y-2 ${propertyDetails ? "border-t border-zinc-100 pt-5" : ""}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Hiring</h3>
                    <AddHiringSignalForm companyId={companyId} />
                  </div>
                  {hiringSignals?.length ? (
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
                  ) : (
                    <p className="text-sm text-zinc-400">None logged.</p>
                  )}
                </div>
                <div className="space-y-2 border-t border-zinc-100 pt-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Sales</h3>
                    <AddSignalForm companyId={companyId} />
                  </div>
                  {signals?.length ? (
                    <ul className="divide-y divide-zinc-100 text-sm">
                      {signals.map((sg) => (
                        <li key={sg.id} className="flex items-center justify-between py-2">
                          <span className="font-medium text-zinc-900">{sg.signal_type}</span>
                          <span className="text-xs text-zinc-500">{sg.strength}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-zinc-400">None logged.</p>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <Card title="Qualification">
            <dl className="grid gap-x-10 gap-y-5 text-sm md:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-zinc-500">Qualification summary</dt>
                <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-zinc-900">{company.qualification_summary ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-zinc-500">Why now (SDR signal summary)</dt>
                <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-zinc-900">{company.sdr_signal_summary ?? "—"}</dd>
              </div>
            </dl>
          </Card>
        </main>

        {/* Side column: stays in view while scrolling (stacks around the main column on small screens) */}
        <aside className="contents lg:sticky lg:top-4 lg:-mx-1 lg:block lg:max-h-[calc(100vh-2rem)] lg:space-y-5 lg:overflow-y-auto lg:px-1 lg:pb-2">
          {showVerify && (
            <div className="order-first lg:order-none">
              <VerifyBox companyId={companyId} status={company.verification_status} last={lastReview} />
            </div>
          )}
          <div>
            <Card title="Offer recommendations" action={<AddOfferForm companyId={companyId} />}>
              {!offers?.length ? (
                <p className="text-sm text-zinc-500">No offer recommendations yet.</p>
              ) : (
                <OfferList companyId={companyId} offers={offers} />
              )}
            </Card>
          </div>
          <div className="order-last lg:order-none">
            <Card title="Activity">
              <div className="space-y-3">
                <AddActivityForm companyId={companyId} />
                {!!activities?.length && (
                  <ul className="divide-y divide-zinc-100 text-sm">
                    {activities.map((a) => (
                      <li key={a.id} className="py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-zinc-900">{a.activity_type}</span>
                          <span className="text-xs text-zinc-500">{new Date(a.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="text-xs text-zinc-500">{a.actor_name}</div>
                        {a.body && <p className="mt-1 whitespace-pre-wrap text-zinc-600">{a.body}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Chip({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{children}</span>;
}

function QuickStat({ label, value, hint }: { label: string; value?: string | number | null; hint?: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-0.5 text-xl font-semibold text-zinc-900">{value ?? "—"}</div>
      {hint && <div className="text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}
