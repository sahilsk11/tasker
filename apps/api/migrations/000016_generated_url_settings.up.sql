ALTER TABLE working_path_settings
ADD COLUMN generated_url_mode text NOT NULL DEFAULT 'localhost'
CHECK (generated_url_mode IN ('localhost', 'public'));

ALTER TABLE working_path_settings
ADD COLUMN public_app_base_url text;
