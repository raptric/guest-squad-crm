export type CompanyOption = { id: number; name: string; company_type: string };

type Provenance = {
  source_url?: string | null;
  evidence?: string | null;
  added_by_type?: string | null;
  added_by_name?: string | null;
};

export type LinkRow = Provenance & {
  company: CompanyOption;
  job_title: string;
  contact_role: string;
  decision_maker_level: string;
  is_verified: boolean;
};

export type ChannelRow = Provenance & {
  value: string;
  label: string;
  company_id: number | null;
  is_verified: boolean;
};
