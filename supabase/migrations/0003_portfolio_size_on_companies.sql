-- portfolio_size describes the size of a GROUP (Management Company / Ownership Company /
-- Operator / Hotel Group-Portfolio / STR Management Company), not an individual property.
-- Keeping it on property_details meant re-entering (and re-drifting) the same number on
-- every property in a group instead of once on the parent. Move it to companies, entered
-- once on the portfolio/group's own record.
ALTER TABLE companies ADD COLUMN portfolio_size INTEGER CHECK (portfolio_size >= 0);
ALTER TABLE property_details DROP COLUMN portfolio_size;
