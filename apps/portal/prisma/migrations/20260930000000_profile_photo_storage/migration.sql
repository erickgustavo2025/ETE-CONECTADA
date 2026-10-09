ALTER TABLE student_profile_photos ALTER COLUMN photo_data DROP NOT NULL;
ALTER TABLE student_profile_photos ADD COLUMN object_key TEXT;
ALTER TABLE student_profile_photos ADD COLUMN storage_bucket TEXT;
CREATE UNIQUE INDEX student_profile_photos_object_key_key ON student_profile_photos(object_key);
ALTER TABLE student_profile_photos ADD CONSTRAINT student_profile_photos_storage_check CHECK (
  (photo_data IS NOT NULL AND object_key IS NULL AND storage_bucket IS NULL)
  OR (photo_data IS NULL AND object_key IS NOT NULL AND object_key <> ''
      AND storage_bucket IS NOT NULL AND storage_bucket <> '')
);
