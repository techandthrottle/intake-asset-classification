/*
  # Create Links Table for LinkHub

  ## Summary
  This migration creates the core links table for the LinkHub URL management application.
  It includes metadata fields for URL previews, timestamps, and tagging functionality.

  ## New Tables
  1. `links`
    - `id` (uuid, primary key) - Unique identifier for each link
    - `url` (text, required) - The actual URL/link being stored
    - `title` (text, optional) - Fetched or user-provided title
    - `description` (text, optional) - Fetched or user-provided description
    - `favicon` (text, optional) - URL to the site's favicon
    - `created_at` (timestamptz) - Timestamp when link was added
    - `submitted_by` (text, required) - Name/identifier of person who submitted
    - `tags` (text[], optional) - Array of tags for categorization

  ## Security
  1. Enable Row Level Security on `links` table
  2. Policy: Allow anyone to read all links (internal team tool)
  3. Policy: Allow authenticated users to insert links
  4. Policy: Allow authenticated users to update their own links
  5. Policy: Allow authenticated users to delete their own links

  ## Notes
  - RLS is enabled for security but policies are permissive for team collaboration
  - All team members can view all links
  - Users can only modify/delete their own submissions
*/

-- Create links table
CREATE TABLE IF NOT EXISTS links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  title text,
  description text,
  favicon text,
  created_at timestamptz DEFAULT now(),
  submitted_by text NOT NULL,
  tags text[] DEFAULT '{}',
  CONSTRAINT url_not_empty CHECK (length(trim(url)) > 0),
  CONSTRAINT submitted_by_not_empty CHECK (length(trim(submitted_by)) > 0)
);

-- Enable Row Level Security
ALTER TABLE links ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to read all links (team collaboration)
CREATE POLICY "Anyone can view all links"
  ON links
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert links
CREATE POLICY "Authenticated users can insert links"
  ON links
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow authenticated users to update their own links
CREATE POLICY "Users can update own links"
  ON links
  FOR UPDATE
  TO authenticated
  USING (submitted_by = current_user)
  WITH CHECK (submitted_by = current_user);

-- Policy: Allow authenticated users to delete their own links
CREATE POLICY "Users can delete own links"
  ON links
  FOR DELETE
  TO authenticated
  USING (submitted_by = current_user);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS links_created_at_idx ON links (created_at DESC);
CREATE INDEX IF NOT EXISTS links_submitted_by_idx ON links (submitted_by);
CREATE INDEX IF NOT EXISTS links_tags_idx ON links USING GIN (tags);