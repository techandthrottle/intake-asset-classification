import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface ExtractedFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  thumbnailLink?: string;
  downloadUrl: string;
  classification?: string | null;
  description?: string | null;
  classificationStatus?: 'pending' | 'classifying' | 'completed' | 'failed';
  error?: string;
  diagnostics?: {
    downloadSuccess: boolean;
    contentType?: string;
    fileSize?: number;
    usedVisualContent: boolean;
    modelUsed: string;
  };
}

export interface Link {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  favicon: string | null;
  created_at: string;
  submitted_by: string;
  tags: string[];
  google_drive_files: ExtractedFile[];
  is_google_drive: boolean;
  processing_status: 'none' | 'pending' | 'processing' | 'completed' | 'failed';
  processing_error: string | null;
}
