import { createClient } from '@supabase/supabase-js';

// In Vercel serverless functions, environment variables are available via process.env
// VITE_ prefixed variables are available in the build, but in serverless functions
// we can access them directly or use the same name
export const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
export const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Get an authenticated Supabase client from request headers
 * @param {Object} headers - Request headers object
 * @returns {Object} - { supabase: authenticated client, user: user object, error: error if any }
 */
export async function getAuthenticatedClient(headers) {
  const authHeader = headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'No authorization token provided' };
  }

  const token = authHeader.substring(7);
  
  // Create a new client instance with the user's token
  const authenticatedClient = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  // Verify the token and get the user
  const { data: { user }, error } = await authenticatedClient.auth.getUser(token);

  if (error || !user) {
    return { error: 'Invalid or expired token' };
  }

  return { supabase: authenticatedClient, user };
}
