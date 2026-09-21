-- General company email (info@, reservations@, sales@ ...). Deliberately NOT a contact: a
-- shared mailbox is not a person, and generic addresses never become contacts.
ALTER TABLE companies ADD COLUMN email VARCHAR(255);

-- Google Maps listing. google_cid is the listing's stable customer id (the second hex number in
-- the Maps URL). Unlike the ChIJ place id in the same URL, it doesn't change between scrapes,
-- and unlike a website domain it is unique per physical hotel even within a chain.
ALTER TABLE companies ADD COLUMN google_maps_url TEXT;
ALTER TABLE companies ADD COLUMN google_cid VARCHAR(40);

CREATE UNIQUE INDEX idx_companies_google_cid ON companies (google_cid)
  WHERE google_cid IS NOT NULL AND deleted_at IS NULL;
