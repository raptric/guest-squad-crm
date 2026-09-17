import { NextResponse } from "next/server";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchEnum } from "@/lib/companies/matching";
import {
  COMPANY_TYPES,
  PROPERTY_TYPES,
  LEAD_STATUSES,
  PROSPECT_TIERS,
  RATING_CHANNELS,
  STRENGTH_LEVELS,
  HIRING_SIGNAL_ROLES,
  OFFER_SERVICES,
  OFFER_TYPES,
  AGENT_ALLOWED_LEAD_STATUSES,
} from "@/lib/companies/constants";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

const mcpHandler = createMcpHandler((server) => {
  const supabase = createAdminClient();

  server.registerTool(
    "list_companies",
    {
      title: "List Companies",
      description:
        "List companies (properties, management companies, portfolios), optionally filtered by lead_status, lifecycle_stage, or company_type. Use this to find leads to research.",
      inputSchema: {
        lead_status: z.string().optional(),
        lifecycle_stage: z.string().optional(),
        company_type: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async ({ lead_status, lifecycle_stage, company_type, limit }) => {
      let query = supabase
        .from("companies")
        .select("id, name, website, city, state, country, company_type, lifecycle_stage, lead_status, prospect_tier, parent_company_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (lead_status) query = query.eq("lead_status", lead_status);
      if (lifecycle_stage) query = query.eq("lifecycle_stage", lifecycle_stage);
      if (company_type) query = query.eq("company_type", company_type);

      const { data, error } = await query;
      if (error) return errorResult(error.message);
      return json(data);
    }
  );

  server.registerTool(
    "get_company",
    {
      title: "Get Company",
      description:
        "Get full detail for one company: core fields, property profile, ratings, hiring signals, sales signals, pain signals, contacts, offer recommendations, and parent/child portfolio links.",
      inputSchema: { company_id: z.number().int() },
    },
    async ({ company_id }) => {
      const { data: company, error } = await supabase
        .from("companies")
        .select(
          `*, parent_company:parent_company_id ( id, name, company_type ),
           owner:owner_id ( id, name )`
        )
        .eq("id", company_id)
        .is("deleted_at", null)
        .single();

      if (error || !company) return errorResult(error?.message ?? "Company not found");

      const [
        { data: propertyDetails },
        { data: children },
        { data: contacts },
        { data: ratings },
        { data: hiringSignals },
        { data: signals },
        { data: offers },
      ] = await Promise.all([
        company.company_type === "Property"
          ? supabase.from("property_details").select("*").eq("company_id", company_id).single()
          : Promise.resolve({ data: null }),
        supabase.from("companies").select("id, name, company_type, city, country").eq("parent_company_id", company_id).is("deleted_at", null),
        supabase.from("contacts").select("*").eq("company_id", company_id).is("deleted_at", null),
        supabase.from("company_ratings").select("*").eq("company_id", company_id),
        supabase.from("company_hiring_signals").select("*").eq("company_id", company_id),
        supabase.from("company_signals").select("*").eq("company_id", company_id),
        supabase.from("offer_recommendations").select("*").eq("company_id", company_id),
      ]);

      const { data: painSignals } = propertyDetails
        ? await supabase.from("property_pain_signals").select("*").eq("property_id", propertyDetails.id)
        : { data: null };

      return json({ company, propertyDetails, children, contacts, ratings, hiringSignals, signals, offers, painSignals });
    }
  );

  server.registerTool(
    "find_or_create_company",
    {
      title: "Find or Create Company",
      description:
        "Find an existing company by name/website, or create it if it doesn't exist. Use this both for a company you're researching and for newly-discovered related companies (e.g. a portfolio owner or sibling property). Never creates a duplicate for the same name+website.",
      inputSchema: {
        name: z.string(),
        company_type: z.string().default("Property"),
        website: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        property_type: z.string().optional(),
        parent_company_id: z.number().int().optional(),
      },
    },
    async ({ name, company_type, website, city, state, country, property_type, parent_company_id }) => {
      const resolvedType = matchEnum(company_type, COMPANY_TYPES, "Property")!;

      let existing = null;
      if (website) {
        const { data } = await supabase.from("companies").select("id").ilike("website", `%${website}%`).is("deleted_at", null).limit(1).single();
        existing = data;
      }
      if (!existing) {
        const { data } = await supabase.from("companies").select("id").ilike("name", name).is("deleted_at", null).limit(1).single();
        existing = data;
      }

      if (existing) {
        return json({ status: "found", company_id: existing.id });
      }

      const { data: created, error } = await supabase
        .from("companies")
        .insert({
          name,
          website: website || null,
          city: city || null,
          state: state || null,
          country: country || null,
          company_type: resolvedType,
          parent_company_id: parent_company_id || null,
          lifecycle_stage: "Prospect",
          lead_status: "New",
          source: "codex_research",
        })
        .select("id")
        .single();

      if (error || !created) return errorResult(error?.message ?? "Failed to create company");

      if (resolvedType === "Property") {
        await supabase.from("property_details").insert({
          company_id: created.id,
          property_type: matchEnum(property_type, PROPERTY_TYPES, null),
          portfolio_role: parent_company_id ? "Portfolio Property" : "Independent",
        });
      }

      return json({ status: "created", company_id: created.id });
    }
  );

  server.registerTool(
    "link_company_to_parent",
    {
      title: "Link Company to Parent",
      description:
        "Set an existing company's parent company (portfolio/group). Use this after discovering a company belongs to a portfolio you've found or created with find_or_create_company.",
      inputSchema: { company_id: z.number().int(), parent_company_id: z.number().int() },
    },
    async ({ company_id, parent_company_id }) => {
      const { error } = await supabase.from("companies").update({ parent_company_id }).eq("id", company_id);
      if (error) return errorResult(error.message);

      // Only upgrade an unset/default role -- never overwrite a more specific one a human set.
      await supabase
        .from("property_details")
        .update({ portfolio_role: "Portfolio Property" })
        .eq("company_id", company_id)
        .in("portfolio_role", ["Independent"]);

      return json({ status: "linked", company_id, parent_company_id });
    }
  );

  server.registerTool(
    "update_qualification",
    {
      title: "Update Qualification",
      description: "Write research findings: qualification summary, why-now narrative, and/or prospect tier.",
      inputSchema: {
        company_id: z.number().int(),
        qualification_summary: z.string().optional(),
        sdr_signal_summary: z.string().optional(),
        prospect_tier: z.string().optional(),
      },
    },
    async ({ company_id, qualification_summary, sdr_signal_summary, prospect_tier }) => {
      const fields: Record<string, string> = {};
      if (qualification_summary !== undefined) fields.qualification_summary = qualification_summary;
      if (sdr_signal_summary !== undefined) fields.sdr_signal_summary = sdr_signal_summary;
      if (prospect_tier !== undefined) {
        const tier = matchEnum(prospect_tier, PROSPECT_TIERS, null);
        if (!tier) return errorResult(`Invalid prospect_tier. Allowed: ${PROSPECT_TIERS.join(", ")}`);
        fields.prospect_tier = tier;
      }

      const { error } = await supabase.from("companies").update(fields).eq("id", company_id);
      if (error) return errorResult(error.message);
      return json({ status: "updated", company_id });
    }
  );

  server.registerTool(
    "add_rating",
    {
      title: "Add Rating",
      description: `Add or refresh a review-channel rating. Channels: ${RATING_CHANNELS.join(", ")}.`,
      inputSchema: {
        company_id: z.number().int(),
        channel: z.string(),
        rating: z.number().optional(),
        review_count: z.number().int().optional(),
      },
    },
    async ({ company_id, channel, rating, review_count }) => {
      const resolvedChannel = matchEnum(channel, RATING_CHANNELS, null);
      if (!resolvedChannel) return errorResult(`Invalid channel. Allowed: ${RATING_CHANNELS.join(", ")}`);

      const { error } = await supabase
        .from("company_ratings")
        .upsert(
          { company_id, channel: resolvedChannel, rating: rating ?? null, review_count: review_count ?? null, captured_at: new Date().toISOString() },
          { onConflict: "company_id,channel" }
        );
      if (error) return errorResult(error.message);
      return json({ status: "saved", company_id, channel: resolvedChannel });
    }
  );

  server.registerTool(
    "add_signal",
    {
      title: "Add Sales Signal",
      description: "Log a company-level sales signal (management change, portfolio expansion, guest complaints, etc.). Free text signal_type -- no fixed list.",
      inputSchema: {
        company_id: z.number().int(),
        signal_type: z.string(),
        strength: z.string().optional(),
        source_url: z.string().optional(),
      },
    },
    async ({ company_id, signal_type, strength, source_url }) => {
      const { error } = await supabase.from("company_signals").insert({
        company_id,
        signal_type,
        strength: matchEnum(strength, STRENGTH_LEVELS, null),
        source_url: source_url || null,
      });
      if (error) return errorResult(error.message);
      return json({ status: "logged", company_id });
    }
  );

  server.registerTool(
    "add_hiring_signal",
    {
      title: "Add Hiring Signal",
      description: `Log a detected job posting for this company. Roles: ${HIRING_SIGNAL_ROLES.join(", ")}.`,
      inputSchema: {
        company_id: z.number().int(),
        role: z.string().optional(),
        job_title: z.string().optional(),
        strength: z.string().optional(),
        source_url: z.string().optional(),
      },
    },
    async ({ company_id, role, job_title, strength, source_url }) => {
      const { error } = await supabase.from("company_hiring_signals").insert({
        company_id,
        role: matchEnum(role, HIRING_SIGNAL_ROLES, null),
        job_title: job_title || null,
        strength: matchEnum(strength, STRENGTH_LEVELS, null),
        source_url: source_url || null,
      });
      if (error) return errorResult(error.message);
      return json({ status: "logged", company_id });
    }
  );

  server.registerTool(
    "add_pain_signal",
    {
      title: "Add Pain Signal",
      description: "Log a guest-communication pain signal found for a Property (e.g. unanswered calls, front desk staffing). Only valid for companies that are Properties.",
      inputSchema: { company_id: z.number().int(), pain_type: z.string(), source_url: z.string().optional() },
    },
    async ({ company_id, pain_type, source_url }) => {
      const { data: propertyDetails } = await supabase.from("property_details").select("id").eq("company_id", company_id).single();
      if (!propertyDetails) return errorResult("This company has no property profile -- pain signals only apply to Properties");

      const { error } = await supabase.from("property_pain_signals").insert({
        property_id: propertyDetails.id,
        pain_type,
        source_url: source_url || null,
      });
      if (error) return errorResult(error.message);
      return json({ status: "logged", company_id });
    }
  );

  server.registerTool(
    "add_offer_recommendation",
    {
      title: "Add Offer Recommendation",
      description: `Recommend which GuestSquad service to pitch. Services: ${OFFER_SERVICES.join(", ")}. Type is Primary or Secondary -- only one Primary per company is allowed.`,
      inputSchema: {
        company_id: z.number().int(),
        service: z.string(),
        type: z.enum(OFFER_TYPES),
        rationale: z.string().optional(),
      },
    },
    async ({ company_id, service, type, rationale }) => {
      const resolvedService = matchEnum(service, OFFER_SERVICES, null);
      if (!resolvedService) return errorResult(`Invalid service. Allowed: ${OFFER_SERVICES.join(", ")}`);

      const { error } = await supabase.from("offer_recommendations").insert({
        company_id,
        service: resolvedService,
        type,
        rationale: rationale || null,
      });

      if (error) {
        if (error.code === "23505") {
          const message = error.message.includes("one_primary")
            ? "This company already has a Primary recommendation. Use a different company or ask a human to remove the existing one."
            : "This service has already been recommended for this company.";
          return errorResult(message);
        }
        return errorResult(error.message);
      }
      return json({ status: "logged", company_id, service: resolvedService, type });
    }
  );

  server.registerTool(
    "log_activity",
    {
      title: "Log Research Activity",
      description: "Log a research note against a company, visible in its activity timeline (attributed to the agent).",
      inputSchema: { company_id: z.number().int(), body: z.string(), actor_name: z.string().default("Codex") },
    },
    async ({ company_id, body, actor_name }) => {
      const { error } = await supabase.from("activities").insert({
        company_id,
        activity_type: "research",
        actor_type: "agent",
        actor_name,
        body,
      });
      if (error) return errorResult(error.message);
      return json({ status: "logged", company_id });
    }
  );

  server.registerTool(
    "transition_lead_status",
    {
      title: "Transition Lead Status",
      description: `Move a company's lead_status forward. Restricted to: ${AGENT_ALLOWED_LEAD_STATUSES.join(", ")} -- anything past that (Qualified, Ready for Outreach, etc.) is a human decision.`,
      inputSchema: { company_id: z.number().int(), to_status: z.enum(AGENT_ALLOWED_LEAD_STATUSES) },
    },
    async ({ company_id, to_status }) => {
      if (!matchEnum(to_status, LEAD_STATUSES, null)) {
        return errorResult(`Invalid status "${to_status}"`);
      }
      const { error } = await supabase.from("companies").update({ lead_status: to_status }).eq("id", company_id);
      if (error) return errorResult(error.message);
      return json({ status: "updated", company_id, lead_status: to_status });
    }
  );
});

async function authenticate(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.MCP_API_KEY}`;
  return process.env.MCP_API_KEY && authHeader === expected;
}

async function handler(request: Request) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return mcpHandler(request);
}

export { handler as GET, handler as POST };
