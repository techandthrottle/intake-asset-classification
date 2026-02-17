/*
  Add Google Drive Extraction Support

  1. Schema Changes
    - Add google_drive_files (jsonb) column to store extracted file metadata temporarily
    - Stores array of objects with: id, name, mimeType, size, thumbnailLink, downloadUrl
    - Add is_google_drive (boolean) column to quickly identify Google Drive URLs
    - Add processing_status (text) column to track extraction progress
    - Values: none, pending, processing, completed, failed
    - Add processing_error (text) column to store error messages if extraction fails
    
  2. Notes
    - google_drive_files stores extracted image and video files temporarily
    - Files are filtered to only include image and video MIME types
    - Processing happens via Edge Function triggered after URL submission
*/

-- Add new columns to links table
DO $$
BEGIN
  -- Add google_drive_files column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'links' AND column_name = 'google_drive_files'
  ) THEN
    ALTER TABLE links ADD COLUMN google_drive_files jsonb DEFAULT '[]'::jsonb;
  END IF;

  -- Add is_google_drive column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'links' AND column_name = 'is_google_drive'
  ) THEN
    ALTER TABLE links ADD COLUMN is_google_drive boolean DEFAULT false;
  END IF;

  -- Add processing_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'links' AND column_name = 'processing_status'
  ) THEN
    ALTER TABLE links ADD COLUMN processing_status text DEFAULT 'none';
  END IF;

  -- Add processing_error column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'links' AND column_name = 'processing_error'
  ) THEN
    ALTER TABLE links ADD COLUMN processing_error text;
  END IF;
END $$;

-- Add check constraint for processing_status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'links_processing_status_check'
  ) THEN
    ALTER TABLE links ADD CONSTRAINT links_processing_status_check
      CHECK (processing_status IN ('none', 'pending', 'processing', 'completed', 'failed'));
  END IF;
END $$;

-- Create index on is_google_drive for faster queries
CREATE INDEX IF NOT EXISTS idx_links_is_google_drive ON links(is_google_drive);

-- Create index on processing_status for monitoring
CREATE INDEX IF NOT EXISTS idx_links_processing_status ON links(processing_status);