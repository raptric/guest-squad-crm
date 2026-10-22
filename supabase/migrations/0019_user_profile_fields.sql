-- Basic profile info for CRM users. Both optional; name/email/role already exist.
ALTER TABLE users
    ADD COLUMN phone     VARCHAR(50),
    ADD COLUMN job_title VARCHAR(100);
