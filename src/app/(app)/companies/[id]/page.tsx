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
import { verificationLabel } from "@/lib/verification";
import { checkEnrollable, fetchEnrollmentRule } from "@/lib/campaign-rule";
import { InlineField } from "./inline-field";
import { ContactlessField } from "./contactless-field";
import {
  BuildingIcon,
  BulbIcon,
  CityIcon,
  ClipboardCheckIcon,
  ClockIcon,
  FlagIcon,
  GlobeIcon,
  HashIcon,
  IdCardIcon,
  LayersIcon,
  MailIcon,
  MapIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  PulseIcon,
  StarIcon,
  UsersIcon,
} from "../../icons";
import { getPicklistValues } from "@/lib/picklists";
import { getCurrentUser } from "@/lib/current-user";
import { canViewCompany } from "@/lib/visibility";
import { assignableUsers, canAssign } from "@/lib/assignment";
import { fetchActiveCampaigns, fetchCompanyEnrollments } from "@/lib/campaigns";
import { todayUtc } from "@/lib/campaigns-format";
import { CampaignCard } from "./campaign-card";
import { PipelineEditor } from "./pipeline-editor";
import { fetchPipeline } from "@/lib/pipeline";
import { timeAgo } from "@/lib/time-ago";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // A company outside the person's view looks like one that doesn't exist.
  if (!(await canViewCompany(await getCurrentUser(), id))) notFound();
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select(
      `id, name, website, company_type, address_line_1, address_line_2, city, state, country, zip, phone, email,
       lifecycle_stage, lead_status, pipeline_status_id, pipeline_stage_id, verification_status, prospect_tier, qualification_summary, sdr_signal_summary, portfolio_size,
       parent_company:parent_company_id ( id, name ),
       owner:owner_id ( id, name, team_id ),
       team:team_id ( id, name )`
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

  const parentCompany = company.parent_company as unknown as { id: number; name: string } | null;
  const owner = company.owner as unknown as { id: number; name: string; team_id: number | null } | null;
  const team = company.team as unknown as { id: number; name: string } | null;
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
          .select("id, property_type, property_class, rooms_units, portfolio_role, contactless")
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
  const [pipeline, countries, tiers, propertyTypes, propertyClasses, portfolioRoles, { actor, users: assignUsers }] = await Promise.all([
    fetchPipeline({ all: true }),
    getPicklistValues("country"),
    getPicklistValues("prospect_tier"),
    getPicklistValues("property_type"),
    getPicklistValues("property_class"),
    getPicklistValues("portfolio_role"),
    getCurrentUser().then(async (actor) => ({ actor, users: actor && canAssign(actor) ? await assignableUsers(actor) : [] })),
  ]);
  const options = (list: string[], current?: string | null) =>
    (current && !list.includes(current) ? [current, ...list] : list).map((v) => ({ value: v, label: v }));
  // Only team leads and admins can move a company; everyone else just sees who owns it.
  const mayAssign = canAssign(actor);
  const ownerOptions = assignUsers.map((u) => ({ value: String(u.id), label: u.name }));
  const companyId = Number(id);

  // Campaign: only the owner of an eligible company can enroll it; the owner, their team lead and admins can work its tasks.
  const isOwner = !!actor && !!owner && String(owner.id) === String(actor.id);
  const pipelineStatus = pipeline.find((s) => s.id === String(company.pipeline_status_id));
  const pipelineStage = pipelineStatus?.stages.find((g) => g.id === String(company.pipeline_stage_id));
  // Who may be enrolled is a Settings rule (verified? which status / stage combinations?).
  const eligibility = checkEnrollable(await fetchEnrollmentRule(), {
    verification_status: company.verification_status,
    pipeline_status_id: company.pipeline_status_id,
    pipeline_stage_id: company.pipeline_stage_id,
    status_name: pipelineStatus?.name ?? null,
    stage_name: pipelineStage?.name ?? null,
  });
  const ready = eligibility.ok;
  const mayEnroll = ready && isOwner;
  const [enrollments, campaigns] = await Promise.all([fetchCompanyEnrollments(companyId), mayEnroll ? fetchActiveCampaigns() : Promise.resolve([])]);
  const canActOnTasks =
    !!actor &&
    (actor.role === "super_admin" ||
      isOwner ||
      (actor.role === "team_lead" && !!actor.team_id && (String(team?.id) === String(actor.team_id) || String(owner?.team_id) === String(actor.team_id))));
  const showCampaign = ready || enrollments.length > 0;
  // Status / stage (the pipeline). Who may change it is the same set of people who can work the company's tasks.
  const showVerify = company.lead_status === "Qualified" || pipelineStatus?.name === "Qualified" || company.verification_status !== null;
  const lockedCampaignId = enrollments.find((e) => e.status === "active")?.campaign_id ?? null;
  const takenRecipients = enrollments
    .filter((e) => e.status === "active" && e.campaign_id === lockedCampaignId)
    .map((e) => (e.recipient_type === "company" ? "company" : `contact:${e.contact_id}`));
  const enrollNote = !eligibility.ok
    ? eligibility.reason
    : !owner
      ? "This company has no owner yet. Assign it to someone first: only its owner can enroll it."
      : `Only ${owner.name}, the owner, can enroll this company.`;

  const inline = { companyId, target: "company" as const };
  const prop = { companyId, target: "property" as const };
  const websiteHref = company.website ? (/^https?:\/\//i.test(company.website) ? company.website : `https://${company.website}`) : null;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <Link href="/companies" className="text-sm text-zinc-500 hover:text-zinc-800">
          &larr; Back to Companies
        </Link>
        <Link
          href={`/companies/${id}/edit`}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
        >
          <PencilIcon className="h-4 w-4" />
          Edit all fields
        </Link>
      </div>

      <div className="grid gap-5 min-[1400px]:grid-cols-[minmax(0,1fr)_360px] min-[1400px]:items-start 2xl:grid-cols-3">
      {/* Header: identity | property profile | key facts */}
      <section className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm min-[1400px]:col-start-1 min-[1400px]:row-start-1 2xl:col-span-3">
        <div
          className={`grid ${
            propertyDetails
              ? "lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,1.4fr)]"
              : "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)]"
          }`}
        >
          <div
            className={`flex items-center gap-5 border-b border-zinc-100 p-6 ${
              propertyDetails ? "lg:col-span-2 2xl:col-span-1 2xl:border-b-0 2xl:border-r" : "lg:border-b-0 lg:border-r"
            }`}
          >
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-600">
              <BuildingIcon className="h-10 w-10" />
            </div>
            <div className="min-w-0 space-y-2.5">
              <InlineField {...inline} field="name" label="Name" value={company.name} variant="title" />
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Chip className="bg-zinc-100 text-zinc-700">{company.company_type}</Chip>
                <PipelineEditor
                  companyId={companyId}
                  statuses={pipeline}
                  current={{
                    statusId: pipelineStatus?.id ?? null,
                    stageId: pipelineStage?.id ?? null,
                    statusName: pipelineStatus?.name ?? null,
                    stageName: pipelineStage?.name ?? null,
                    color: pipelineStatus?.color ?? null,
                  }}
                  canEdit={canActOnTasks}
                />
                {company.verification_status && (
                  <Chip className={company.verification_status === "Ready for Outreach" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                    <span title={lastReview ? `Reviewed by ${lastReview.reviewer}, ${lastReview.when}` : undefined}>{verificationLabel(company.verification_status)}</span>
                  </Chip>
                )}
              </div>
              {parentCompany && (
                <Link href={`/companies/${parentCompany.id}`} className="block text-sm text-zinc-500 hover:underline">
                  Part of <span className="font-medium text-zinc-800">{parentCompany.name}</span>
                </Link>
              )}
            </div>
          </div>

          {propertyDetails && (
            <div className="border-b border-zinc-100 p-6 lg:border-b-0 lg:border-r">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-600">
                <BuildingIcon className="h-5 w-5 text-sky-600" />
                Property profile
              </h2>
              <dl className="grid grid-cols-2 gap-y-5 [&>*:nth-child(even)]:pl-6 [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-zinc-100 [&>*:nth-child(odd)]:pr-6">
                <InlineField {...prop} field="property_type" label="Type" type="select" options={options(propertyTypes, propertyDetails.property_type)} value={propertyDetails.property_type} />
                <InlineField {...prop} field="property_class" label="Class" type="select" options={options(propertyClasses, propertyDetails.property_class)} value={propertyDetails.property_class} />
                <InlineField {...prop} field="rooms_units" label="Rooms / units" type="number" value={propertyDetails.rooms_units === null ? null : String(propertyDetails.rooms_units)} />
                <InlineField {...prop} field="portfolio_role" label="Portfolio role" type="select" options={options(portfolioRoles, propertyDetails.portfolio_role)} value={propertyDetails.portfolio_role} />
                <ContactlessField companyId={companyId} value={propertyDetails.contactless ?? null} />
              </dl>
            </div>
          )}

          <div className="grid grid-cols-3 divide-x divide-zinc-100">
            <KpiCell icon={<LayersIcon className="h-5 w-5" />}>
              <InlineField {...inline} field="prospect_tier" label="Tier" variant="big" type="select" options={options(tiers, company.prospect_tier)} value={company.prospect_tier} className="text-center" />
            </KpiCell>
            <KpiCell icon={<UsersIcon className="h-5 w-5" />}>
              {mayAssign ? (
                <InlineField {...inline} field="owner_id" label="Owner" variant="big" type="select" options={ownerOptions} value={owner ? String(owner.id) : null} emptyText="Unassigned" className="text-center" />
              ) : (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Owner</div>
                  <div className={`mt-0.5 text-xl font-semibold ${owner ? "text-zinc-900" : "text-zinc-400"}`}>{owner?.name ?? "Unassigned"}</div>
                </div>
              )}
              {team && <div className="text-xs text-zinc-500">Team: {team.name}</div>}
            </KpiCell>
            <KpiCell icon={<IdCardIcon className="h-5 w-5" />}>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Contacts</div>
                <div className="mt-0.5 text-xl font-semibold text-zinc-900">{contacts.length}</div>
              </div>
            </KpiCell>
          </div>
        </div>
      </section>

      {/* Contact & location | ratings */}
      <div className="grid min-w-0 gap-5 min-[1400px]:col-start-1 min-[1400px]:row-start-2 2xl:col-span-3 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card icon={<MapPinIcon className="h-5 w-5" />} title="Contact & location">
          <div className="divide-y divide-zinc-100">
            <div className="grid gap-4 pb-5 sm:grid-cols-2 sm:divide-x sm:divide-zinc-100">
              <FieldCell icon={<MailIcon className="h-5 w-5" />}>
                <InlineField {...inline} field="email" label="General email" type="email" value={company.email} />
              </FieldCell>
              <FieldCell icon={<GlobeIcon className="h-5 w-5" />}>
                <InlineField {...inline} field="website" label="Website" value={company.website} href={websiteHref} />
              </FieldCell>
            </div>
            <div className="grid gap-4 py-5 sm:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)] 2xl:divide-x 2xl:divide-zinc-100">
              <FieldCell icon={<PhoneIcon className="h-5 w-5" />}>
                <InlineField {...inline} field="phone" label="Phone" type="tel" value={company.phone} />
              </FieldCell>
              <FieldCell icon={<MapPinIcon className="h-5 w-5" />}>
                <InlineField {...inline} field="address_line_1" label="Address" value={company.address_line_1} />
              </FieldCell>
              <FieldCell>
                <InlineField {...inline} field="address_line_2" label="Address line 2" value={company.address_line_2} />
              </FieldCell>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-5 sm:grid-cols-4 sm:divide-x sm:divide-zinc-100">
              <FieldCell icon={<CityIcon className="h-5 w-5" />}>
                <InlineField {...inline} field="city" label="City" value={company.city} />
              </FieldCell>
              <FieldCell icon={<MapIcon className="h-5 w-5" />}>
                <InlineField {...inline} field="state" label="State" value={company.state} />
              </FieldCell>
              <FieldCell icon={<FlagIcon className="h-5 w-5" />}>
                <InlineField {...inline} field="country" label="Country" type="select" options={options(countries, company.country)} value={company.country} />
              </FieldCell>
              <FieldCell icon={<HashIcon className="h-5 w-5" />}>
                <InlineField {...inline} field="zip" label="Zip" value={company.zip} />
              </FieldCell>
            </div>
          </div>
        </Card>

        <Card icon={<StarIcon className="h-5 w-5" />} tone="amber" title="Ratings & reviews" action={<AddRatingForm companyId={companyId} />}>
          {!ratings?.length ? (
            <EmptyState icon={<StarIcon className="h-7 w-7" />} text="No ratings logged yet." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-2">
              {ratings.map((r) => (
                <div key={r.channel} className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3.5">
                  <ChannelBadge channel={r.channel} size="lg" />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-semibold text-zinc-900">{r.rating ?? "—"}</span>
                      <span className="truncate text-xs text-zinc-500">{(r.review_count ?? 0).toLocaleString()} reviews</span>
                    </div>
                    <div className="truncate text-sm text-zinc-600">{channelLabel(r.channel)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

        {/* Main: contacts | signals, then qualification */}
        <div className="order-2 min-w-0 space-y-5 min-[1400px]:order-none min-[1400px]:col-start-1 min-[1400px]:row-start-3 2xl:col-span-2">
          {!isProperty && (
            <Card icon={<BuildingIcon className="h-5 w-5" />} title={`Portfolio (${children?.length ?? 0} listed${company.portfolio_size ? ` of ${company.portfolio_size} known` : ""})`}>
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

          <div className="grid gap-5 lg:grid-cols-2">
            <Card icon={<UsersIcon className="h-5 w-5" />} title={`Contacts (${contacts.length})`} action={<AddContactForm companyId={companyId} />}>
              {!contacts.length ? (
                <EmptyState icon={<UsersIcon className="h-8 w-8" />} text="No contacts yet." />
              ) : (
                <ul className="grid gap-3">
                  {contacts.map((c) => (
                    <li key={c.id} className="space-y-1 rounded-xl border border-zinc-200 p-3.5">
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

            <Card icon={<PulseIcon className="h-5 w-5" />} tone="rose" title="Signals">
              <div className="space-y-5">
                {propertyDetails && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
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
                  <div className="flex items-center justify-between gap-2">
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
                  <div className="flex items-center justify-between gap-2">
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

          <div className="grid gap-5 lg:grid-cols-2">
            <Card icon={<ClipboardCheckIcon className="h-5 w-5" />} tone="violet" title="Qualification">
              <dl className="space-y-5 text-sm">
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

            <Card icon={<BulbIcon className="h-5 w-5" />} tone="amber" title="Offers" action={<AddOfferForm companyId={companyId} />}>
              {!offers?.length ? (
                <EmptyState icon={<BulbIcon className="h-7 w-7" />} text="No offer recommendations yet." />
              ) : (
                <OfferList companyId={companyId} offers={offers} />
              )}
            </Card>
          </div>
        </div>

        {/* Side: verify, offers, activity -- sticky on wide screens, stacked around the main block on small ones */}
        <aside className="contents min-[1400px]:sticky min-[1400px]:top-4 min-[1400px]:col-start-2 min-[1400px]:row-span-3 min-[1400px]:row-start-1 min-[1400px]:-mx-1 min-[1400px]:block min-[1400px]:max-h-[calc(100vh-2rem)] min-[1400px]:space-y-5 min-[1400px]:overflow-y-auto min-[1400px]:px-1 min-[1400px]:pb-2 2xl:col-start-3 2xl:row-span-1 2xl:row-start-3">
          {showVerify && (
            <div className="order-1 min-[1400px]:order-none">
              <VerifyBox companyId={companyId} status={company.verification_status} last={lastReview} />
            </div>
          )}
          {showCampaign && (
            <div className="order-3 min-[1400px]:order-none">
              <CampaignCard
                companyId={companyId}
                today={todayUtc()}
                mayEnroll={mayEnroll}
                enrollNote={enrollNote}
                canAct={canActOnTasks}
                enrollments={enrollments}
                campaigns={campaigns}
                recipients={contacts.map((c) => {
                  const email = forThisCompany(c.contact_emails)[0]?.email;
                  const name = `${c.first_name} ${c.last_name ?? ""}`.trim();
                  return { id: Number(c.id), label: email ? `${name} (${email})` : name };
                })}
                lockedCampaignId={lockedCampaignId}
                takenRecipients={takenRecipients}
              />
            </div>
          )}
          <div className="order-4 min-[1400px]:order-none">
            <Card icon={<ClockIcon className="h-5 w-5" />} tone="zinc" title="Activity">
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

const TONES = {
  sky: "bg-sky-50 text-sky-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  violet: "bg-violet-50 text-violet-600",
  emerald: "bg-emerald-50 text-emerald-600",
  zinc: "bg-zinc-100 text-zinc-600",
};

function Card({
  icon,
  tone = "sky",
  title,
  action,
  children,
}: {
  icon?: React.ReactNode;
  tone?: keyof typeof TONES;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-base font-semibold text-zinc-900">
          {icon && <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONES[tone]}`}>{icon}</span>}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Chip({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${className}`}>{children}</span>;
}

// One of the three key facts at the right of the header: icon, then label + value, centred.
function KpiCell({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-3 py-6 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-sky-600">{icon}</span>
      {children}
    </div>
  );
}

// A labelled value with its icon, for the contact & location rows.
function FieldCell({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <span className="w-5 shrink-0 text-sky-600/80">{icon}</span>
      <dl className="min-w-0 flex-1">{children}</dl>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-zinc-100 text-zinc-400">{icon}</span>
      <p className="text-sm text-zinc-500">{text}</p>
    </div>
  );
}
